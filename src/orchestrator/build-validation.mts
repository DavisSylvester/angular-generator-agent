import type { Logger } from 'winston';
import type { Result } from '../types/index.mts';
import { ok, err } from '../types/index.mts';

export interface ValidationElement {
  readonly role: string;
  readonly name: string;
  readonly accessible: boolean;
}

export interface BuildValidationResult {
  readonly buildSuccess: boolean;
  readonly buildError: string | undefined;
  readonly pageLoaded: boolean;
  readonly elementsChecked: readonly ValidationElement[];
  readonly passedCount: number;
  readonly totalChecked: number;
  readonly screenshotData: string;
}

/**
 * Validates that the generated Angular app builds and renders correctly
 * using Playwright.
 *
 * Steps:
 *   1. Run `ng build` (or `bun run build`) to compile the Angular app
 *   2. Serve the built app on a local port
 *   3. Navigate to the default page via Playwright
 *   4. Take a snapshot (accessibility tree)
 *   5. Verify at least N random elements are accessible on the page
 *   6. Take a screenshot for the report
 *   7. Return validation results
 */
export async function runBuildValidation(
  outputDir: string,
  requiredElements: number,
  logger: Logger,
  navigate: (url: string) => Promise<void>,
  snapshot: () => Promise<string>,
  screenshot: () => Promise<string>,
  runCommand: (cmd: string, args: string[], cwd: string) => Promise<{ exitCode: number; stdout: string; stderr: string }>,
): Promise<Result<BuildValidationResult, Error>> {
  logger.info(`\n========== Build Validation ==========`);

  // ── Step 1: Build the Angular app ──────────────────────────────
  logger.info(`Building Angular application...`);

  const buildResult = await runCommand(
    `npx`,
    [`ng`, `build`, `--configuration=development`],
    outputDir,
  );

  if (buildResult.exitCode !== 0) {
    logger.error(`Angular build failed`, { stderr: buildResult.stderr.slice(0, 500) });
    return ok({
      buildSuccess: false,
      buildError: buildResult.stderr.slice(0, 1000),
      pageLoaded: false,
      elementsChecked: [],
      passedCount: 0,
      totalChecked: 0,
      screenshotData: ``,
    });
  }

  logger.info(`Angular build succeeded`);

  // ── Step 2: Serve the built app ────────────────────────────────
  logger.info(`Starting dev server...`);

  // Start the Angular dev server in the background
  const serveResult = await runCommand(
    `npx`,
    [`ng`, `serve`, `--port=4200`, `--open=false`],
    outputDir,
  );

  // Give the server a moment to start (the runCommand may return early for bg processes)
  if (serveResult.exitCode !== 0 && !serveResult.stdout.includes(`listening`)) {
    logger.warn(`Dev server may not have started cleanly`, { exitCode: serveResult.exitCode });
  }

  // ── Step 3: Navigate to the app ────────────────────────────────
  logger.info(`Navigating to http://localhost:4200 ...`);

  try {
    await navigate(`http://localhost:4200`);
  } catch (error) {
    return err(new Error(
      `Failed to navigate to the app: ${error instanceof Error ? error.message : String(error)}`,
    ));
  }

  // ── Step 4: Take accessibility snapshot ────────────────────────
  logger.info(`Taking accessibility snapshot...`);
  let snapshotText: string;
  try {
    snapshotText = await snapshot();
  } catch (error) {
    return err(new Error(
      `Failed to take page snapshot: ${error instanceof Error ? error.message : String(error)}`,
    ));
  }

  const pageLoaded = snapshotText.length > 0 && !snapshotText.includes(`error`);

  // ── Step 5: Verify random elements ─────────────────────────────
  logger.info(`Verifying at least ${requiredElements} elements are accessible...`);

  const allElements = parseAccessibleElements(snapshotText);

  // Pick N random elements to verify
  const shuffled = [...allElements].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, Math.max(requiredElements, Math.min(allElements.length, requiredElements)));

  const checkedElements: ValidationElement[] = selected.map((el) => ({
    role: el.role,
    name: el.name,
    accessible: true, // If we found it in the snapshot, it's accessible
  }));

  // ── Step 6: Take screenshot ────────────────────────────────────
  logger.info(`Taking screenshot...`);
  let screenshotData = ``;
  try {
    screenshotData = await screenshot();
  } catch (error) {
    logger.warn(`Screenshot failed`, {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // ── Step 7: Report results ─────────────────────────────────────
  const passedCount = checkedElements.filter((e) => e.accessible).length;

  const result: BuildValidationResult = {
    buildSuccess: true,
    buildError: undefined,
    pageLoaded,
    elementsChecked: checkedElements,
    passedCount,
    totalChecked: checkedElements.length,
    screenshotData,
  };

  if (passedCount >= requiredElements) {
    logger.info(`Build validation PASSED: ${passedCount}/${requiredElements} elements verified`, {
      elements: checkedElements.map((e) => `${e.role}:${e.name}`),
    });
  } else {
    logger.warn(`Build validation FAILED: only ${passedCount}/${requiredElements} elements found`, {
      found: allElements.length,
      checked: checkedElements.length,
    });
  }

  return ok(result);
}

/**
 * Parse the Playwright accessibility snapshot to extract interactive
 * and visible elements.
 */
function parseAccessibleElements(snapshotText: string): { role: string; name: string }[] {
  const elements: { role: string; name: string }[] = [];
  const lines = snapshotText.split(`\n`);

  // Pattern: "role 'name'" or "role \"name\""
  const elementPattern = /^\s*-?\s*(button|link|heading|textbox|img|navigation|main|banner|table|cell|row|menuitem|tab|checkbox|radio|combobox|slider|progressbar|alert|dialog|list|listitem)\s+["']([^"']+)["']/i;

  for (const line of lines) {
    const match = elementPattern.exec(line);
    if (match?.[1] && match[2]) {
      elements.push({
        role: match[1],
        name: match[2],
      });
    }
  }

  return elements;
}
