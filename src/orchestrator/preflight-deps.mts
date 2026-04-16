import type { Logger } from 'winston';
import type { PlaywrightCallbacks } from './pipeline.mts';

// ── Types ───────────────────────────────────────────────────────────

export type DepStatus = `ok` | `missing` | `stub`;

export interface DepCheckResult {
  readonly name: string;
  readonly status: DepStatus;
  readonly version?: string;
  readonly message: string;
}

export interface PreflightReport {
  readonly passed: boolean;
  readonly checks: readonly DepCheckResult[];
  readonly installed: readonly string[];
}

interface PreflightOptions {
  readonly googleApiKey: string | undefined;
  readonly skipPlaywrightTest: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────────

async function commandExists(cmd: string): Promise<{ found: boolean; version: string }> {
  try {
    const proc = Bun.spawn([cmd, `--version`], { stdout: `pipe`, stderr: `pipe` });
    const stdout = await new Response(proc.stdout).text();
    const code = await proc.exited;
    return { found: code === 0, version: stdout.trim().split(`\n`)[0] ?? `` };
  } catch {
    return { found: false, version: `` };
  }
}

async function installGlobal(pkg: string, logger: Logger): Promise<boolean> {
  logger.info(`Installing ${pkg}...`);
  try {
    const proc = Bun.spawn([`bun`, `add`, `-g`, pkg], { stdout: `pipe`, stderr: `pipe` });
    const stderr = await new Response(proc.stderr).text();
    const code = await proc.exited;

    if (code === 0) {
      logger.info(`${pkg} installed successfully`);
      return true;
    }
    logger.warn(`Failed to install ${pkg}: ${stderr.trim()}`);
    return false;
  } catch (error) {
    logger.warn(`Failed to install ${pkg}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

async function npmInstallGlobal(pkg: string, logger: Logger): Promise<boolean> {
  logger.info(`Installing ${pkg} via npm...`);
  try {
    const proc = Bun.spawn([`npm`, `install`, `-g`, pkg], { stdout: `pipe`, stderr: `pipe` });
    const stderr = await new Response(proc.stderr).text();
    const code = await proc.exited;

    if (code === 0) {
      logger.info(`${pkg} installed successfully via npm`);
      return true;
    }
    logger.warn(`Failed to install ${pkg} via npm: ${stderr.trim()}`);
    return false;
  } catch (error) {
    logger.warn(`Failed to install ${pkg} via npm`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

// ── Individual checks ───────────────────────────────────────────────

async function checkBun(): Promise<DepCheckResult> {
  const { found, version } = await commandExists(`bun`);
  return found
    ? { name: `bun`, status: `ok`, version, message: `Bun runtime available` }
    : { name: `bun`, status: `missing`, message: `Bun is required but not found in PATH` };
}

async function checkNode(): Promise<DepCheckResult> {
  const { found, version } = await commandExists(`node`);
  return found
    ? { name: `node`, status: `ok`, version, message: `Node.js available` }
    : { name: `node`, status: `missing`, message: `Node.js is required for Angular CLI` };
}

async function checkAngularCli(logger: Logger): Promise<{ check: DepCheckResult; didInstall: boolean }> {
  // Check for `ng` in PATH
  const { found, version } = await commandExists(`ng`);
  if (found) {
    return {
      check: { name: `@angular/cli`, status: `ok`, version, message: `Angular CLI available` },
      didInstall: false,
    };
  }

  // Also check via npx — some installs only expose via npx
  try {
    const proc = Bun.spawn([`npx`, `ng`, `version`], { stdout: `pipe`, stderr: `pipe` });
    const stdout = await new Response(proc.stdout).text();
    const code = await proc.exited;
    if (code === 0) {
      const ver = stdout.match(/Angular CLI:\s*(\S+)/)?.[1] ?? `unknown`;
      return {
        check: { name: `@angular/cli`, status: `ok`, version: ver, message: `Angular CLI available via npx` },
        didInstall: false,
      };
    }
  } catch { /* fall through to install */ }

  // Attempt install
  logger.info(`Angular CLI not found — attempting install`);
  const installed = await npmInstallGlobal(`@angular/cli`, logger);

  if (installed) {
    const recheck = await commandExists(`ng`);
    return {
      check: {
        name: `@angular/cli`,
        status: recheck.found ? `ok` : `missing`,
        version: recheck.version,
        message: recheck.found ? `Angular CLI installed and verified` : `Angular CLI installed but not in PATH — use npx ng`,
      },
      didInstall: true,
    };
  }

  return {
    check: { name: `@angular/cli`, status: `missing`, message: `Angular CLI not found and installation failed. Run: npm install -g @angular/cli` },
    didInstall: false,
  };
}

async function checkPlaywright(
  pw: PlaywrightCallbacks,
  logger: Logger,
  skipTest: boolean,
): Promise<{ check: DepCheckResult; didInstall: boolean }> {
  // Check if npx is available for fallback installs
  const { version: pwVersion } = await commandExists(`npx`);

  if (skipTest) {
    return {
      check: {
        name: `playwright-mcp`,
        status: `ok`,
        message: `Playwright check skipped (--skip-playwright-test)`,
      },
      didInstall: false,
    };
  }

  // Test if the MCP callbacks are functional by attempting a navigate + screenshot
  logger.info(`Testing Playwright MCP callbacks...`);

  try {
    await pw.navigate(`about:blank`);
    const screenshot = await pw.screenshot();

    // If screenshot returns empty string, the callbacks are stubs (standalone mode)
    if (!screenshot) {
      logger.warn(`Playwright MCP callbacks returned empty — running in standalone mode`);

      // Check if @anthropic-ai/claude-code-playwright is available
      const playwrightInstalled = await checkPlaywrightPackage();

      if (!playwrightInstalled) {
        logger.info(`Playwright not available — attempting to install @playwright/test`);
        const installed = await installGlobal(`playwright`, logger);

        if (installed) {
          // Install browsers
          logger.info(`Installing Playwright browsers...`);
          try {
            const proc = Bun.spawn([`npx`, `playwright`, `install`, `chromium`], {
              stdout: `pipe`,
              stderr: `pipe`,
            });
            await proc.exited;
            logger.info(`Playwright browsers installed`);
          } catch {
            logger.warn(`Failed to install Playwright browsers`);
          }

          return {
            check: {
              name: `playwright-mcp`,
              status: `stub`,
              message: `Playwright MCP not connected — fallback playwright package installed. `
                + `For full MCP support, run inside Claude Code with the Playwright plugin enabled.`,
            },
            didInstall: true,
          };
        }

        return {
          check: {
            name: `playwright-mcp`,
            status: `stub`,
            message: `Playwright MCP not connected and fallback install failed. `
              + `Pipeline will run with no-op browser callbacks. `
              + `For browser automation, run inside Claude Code with the Playwright plugin.`,
          },
          didInstall: false,
        };
      }

      return {
        check: {
          name: `playwright-mcp`,
          status: `stub`,
          version: pwVersion,
          message: `Playwright MCP callbacks are stubs — browser automation will be no-ops. `
            + `For full support, run inside Claude Code with the Playwright plugin enabled.`,
        },
        didInstall: false,
      };
    }

    // Callbacks work — MCP is connected
    return {
      check: {
        name: `playwright-mcp`,
        status: `ok`,
        message: `Playwright MCP connected and functional`,
      },
      didInstall: false,
    };
  } catch (error) {
    return {
      check: {
        name: `playwright-mcp`,
        status: `missing`,
        message: `Playwright MCP test failed: ${error instanceof Error ? error.message : String(error)}. `
          + `Ensure the Playwright plugin is enabled in Claude Code settings.`,
      },
      didInstall: false,
    };
  }
}

async function checkPlaywrightPackage(): Promise<boolean> {
  try {
    const proc = Bun.spawn([`npx`, `playwright`, `--version`], {
      stdout: `pipe`,
      stderr: `pipe`,
    });
    const code = await proc.exited;
    return code === 0;
  } catch {
    return false;
  }
}

function checkGoogleApiKey(apiKey: string | undefined): DepCheckResult {
  if (apiKey) {
    return {
      name: `google-api-key`,
      status: `ok`,
      message: `Google API key configured (Gemini + Stitch)`,
    };
  }
  return {
    name: `google-api-key`,
    status: `missing`,
    message: `GOOGLE_API_KEY not set — Stitch design generation and style guide extraction will be skipped`,
  };
}

// ── Main preflight function ─────────────────────────────────────────

/**
 * Runs preflight dependency checks. Attempts to install missing
 * dependencies where possible. Returns a report of all checks.
 *
 * Critical failures (bun, node) will cause the pipeline to abort.
 * Non-critical failures (Playwright stubs, missing API key) are
 * logged as warnings — the pipeline degrades gracefully.
 */
export async function runPreflightChecks(
  pw: PlaywrightCallbacks,
  logger: Logger,
  options: PreflightOptions,
): Promise<PreflightReport> {
  logger.info(`\n========== Preflight: Dependency Check ==========`);

  const checks: DepCheckResult[] = [];
  const installed: string[] = [];

  // Run independent checks in parallel
  const [bunCheck, nodeCheck] = await Promise.all([
    checkBun(),
    checkNode(),
  ]);
  checks.push(bunCheck, nodeCheck);

  // Angular CLI check (may install)
  const ngResult = await checkAngularCli(logger);
  checks.push(ngResult.check);
  if (ngResult.didInstall) installed.push(`@angular/cli`);

  // Playwright MCP check (may install fallback)
  const pwResult = await checkPlaywright(pw, logger, options.skipPlaywrightTest);
  checks.push(pwResult.check);
  if (pwResult.didInstall) installed.push(`playwright`);

  // Google API key check
  checks.push(checkGoogleApiKey(options.googleApiKey));

  // Report
  const critical = checks.filter((c) => c.status === `missing` && [`bun`, `node`].includes(c.name));
  const warnings = checks.filter((c) => c.status !== `ok` && !critical.includes(c));
  const passed = critical.length === 0;

  logger.info(`\nPreflight results:`);
  for (const check of checks) {
    const icon = check.status === `ok` ? `✅` : check.status === `stub` ? `⚠️` : `❌`;
    const ver = check.version ? ` (${check.version})` : ``;
    logger.info(`  ${icon} ${check.name}${ver} — ${check.message}`);
  }

  if (installed.length > 0) {
    logger.info(`\nAuto-installed: ${installed.join(`, `)}`);
  }

  if (warnings.length > 0) {
    logger.warn(`\n${warnings.length} non-critical issue(s) — pipeline will run with reduced capabilities`);
  }

  if (!passed) {
    logger.error(`\nPreflight FAILED — ${critical.length} critical dependency missing`);
    for (const c of critical) {
      logger.error(`  ✗ ${c.name}: ${c.message}`);
    }
  } else {
    logger.info(`\nPreflight PASSED`);
  }

  return { passed, checks, installed };
}
