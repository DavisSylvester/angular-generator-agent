import { chromium } from "playwright";
import type { Browser, BrowserContext, Page } from "playwright";
import type { Logger } from "winston";
import type { PlaywrightCallbacks } from "../orchestrator/pipeline.mts";

// ── Ref tracking for fill/click ─────────────────────────────────────

interface ElementRef {
  role: string;
  name: string;
}

// ── Public interface ────────────────────────────────────────────────

export interface BrowserHandle {

  readonly callbacks: PlaywrightCallbacks;
  close(): Promise<void>;
}

interface LaunchOptions {
  headless: boolean;
  logger: Logger;
}

// ── Roles that get a [ref=] for fill/click ──────────────────────────

const INTERACTIVE_ROLES = new Set([
  "textbox", "textarea", "button", "radio", "checkbox",
  "combobox", "slider", "link", "menuitem", "tab",
  "option", "searchbox", "spinbutton", "switch",
]);

// ── Snapshot transformer ────────────────────────────────────────────
//
// Playwright 1.59+ `page.ariaSnapshot()` returns YAML-like text:
//
//   - navigation:
//     - link "Home":
//       - /url: /home
//   - main:
//     - heading "Hello" [level=1]
//     - button "Click me"
//     - textbox "Name"
//
// We transform it to the format the existing parsers expect:
//   1. Inline `/url:` lines onto the parent link line
//   2. Add `[ref=eN]` for interactive elements
//   3. Build a ref map for fill/click

function transformSnapshot(
  raw: string,
  refMap: Map<string, ElementRef>,
): string {

  refMap.clear();
  const lines = raw.split("\n");
  const result: string[] = [];
  let counter = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";

    // Skip /url: lines — they get merged into the parent link
    if (/^\s*-\s*\/url:/.test(line)) continue;

    // Detect role and name: "- role" or '- role "name"' or '- role "name" [attrs]'
    const roleMatch = /^(\s*-\s*)(\w+)(.*)$/.exec(line);
    if (!roleMatch) {
      result.push(line);
      continue;
    }

    const indent = roleMatch[1] ?? "";
    const role = roleMatch[2] ?? "";
    let rest = roleMatch[3] ?? "";

    // Strip trailing colon (ariaSnapshot uses `:` for containers with children)
    rest = rest.replace(/:$/, "");

    // Extract name if present: ' "Name"' or ' "Name" [attrs]'
    const nameMatch = /^\s+"([^"]*)"(.*)$/.exec(rest);
    const name = nameMatch?.[1] ?? "";
    const attrs = nameMatch?.[2]?.trim() ?? rest.trim();

    // Add ref for interactive elements
    let refStr = "";
    if (INTERACTIVE_ROLES.has(role.toLowerCase())) {
      const ref = `e${counter++}`;
      refStr = ` [ref=${ref}]`;
      refMap.set(ref, { role, name });
    }

    // For links, check if next line is /url: and inline it
    let urlStr = "";
    if (role.toLowerCase() === "link") {
      const nextLine = lines[i + 1] ?? "";
      const urlMatch = /^\s*-\s*\/url:\s*(.+)$/.exec(nextLine);
      if (urlMatch) {
        urlStr = ` url: ${(urlMatch[1] ?? "").trim()}`;
        // The /url: line will be skipped by the check at the top
      }
    }

    // Reconstruct the line
    let transformed = `${indent}${role}`;
    if (name) transformed += ` "${name}"`;
    if (attrs) transformed += ` ${attrs}`;
    transformed += refStr;
    transformed += urlStr;

    result.push(transformed);
  }

  return result.join("\n");
}

// ── Resolve ref to Playwright locator ───────────────────────────────

function resolveRef(
  page: Page,
  ref: string,
  refMap: Map<string, ElementRef>,
): ReturnType<Page["getByRole"]> {

  const entry = refMap.get(ref);
  if (!entry) {
    throw new Error(`Unknown ref "${ref}" — snapshot may be stale`);
  }

  const roleMap: Record<string, string> = {
    textbox: "textbox",
    textarea: "textbox",
    searchbox: "searchbox",
    button: "button",
    radio: "radio",
    checkbox: "checkbox",
    combobox: "combobox",
    slider: "slider",
    link: "link",
    menuitem: "menuitem",
    tab: "tab",
    option: "option",
    spinbutton: "spinbutton",
    switch: "switch",
  };

  const ariaRole = roleMap[entry.role.toLowerCase()] ?? entry.role.toLowerCase();

  if (entry.name) {
    return page.getByRole(ariaRole as Parameters<Page["getByRole"]>[0], { name: entry.name });
  }
  return page.getByRole(ariaRole as Parameters<Page["getByRole"]>[0]);
}

// ── Main launcher ───────────────────────────────────────────────────

export async function launchBrowser(options: LaunchOptions): Promise<BrowserHandle> {

  const { headless, logger } = options;

  logger.info(`Launching Chromium (headless: ${headless})...`);

  const browser: Browser = await chromium.launch({ headless });
  const context: BrowserContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  let activePage: Page = await context.newPage();

  // Ref map rebuilt on each snapshot() call
  const refMap = new Map<string, ElementRef>();

  logger.info(`Browser launched`);

  const callbacks: PlaywrightCallbacks = {

    navigate: async (url: string): Promise<void> => {
      logger.info(`[Browser] Navigate: ${url}`);
      try {
        await activePage.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
      } catch {
        logger.debug(`networkidle timed out, retrying with domcontentloaded`);
        await activePage.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      }
    },

    snapshot: async (): Promise<string> => {
      logger.debug(`[Browser] Snapshot`);
      const raw = await activePage.ariaSnapshot();
      return transformSnapshot(raw, refMap);
    },

    screenshot: async (): Promise<string> => {
      logger.debug(`[Browser] Screenshot`);
      const buffer = await activePage.screenshot({ fullPage: true });
      return buffer.toString("base64");
    },

    openTab: async (url: string): Promise<void> => {
      logger.info(`[Browser] Open tab: ${url}`);
      const newPage = await context.newPage();
      try {
        await newPage.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
      } catch {
        await newPage.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      }
      activePage = newPage;
    },

    fill: async (ref: string, value: string): Promise<void> => {
      logger.debug(`[Browser] Fill ref=${ref}`);
      const locator = resolveRef(activePage, ref, refMap);
      await locator.fill(value);
    },

    click: async (ref: string): Promise<void> => {
      logger.debug(`[Browser] Click ref=${ref}`);
      const locator = resolveRef(activePage, ref, refMap);
      await locator.click();
    },

    runCommand: async (
      cmd: string,
      args: string[],
      cwd: string,
    ): Promise<{ exitCode: number; stdout: string; stderr: string }> => {
      logger.info(`[Shell] ${cmd} ${args.join(" ")}`, { cwd });
      try {
        const proc = Bun.spawn([cmd, ...args], { cwd, stdout: "pipe", stderr: "pipe" });
        const [stdout, stderr, exitCode] = await Promise.all([
          new Response(proc.stdout).text(),
          new Response(proc.stderr).text(),
          proc.exited,
        ]);
        return { exitCode, stdout, stderr };
      } catch (error) {
        return {
          exitCode: 1,
          stdout: "",
          stderr: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };

  return {
    callbacks,
    close: async (): Promise<void> => {
      logger.info(`Closing browser...`);
      await context.close();
      await browser.close();
    },
  };
}
