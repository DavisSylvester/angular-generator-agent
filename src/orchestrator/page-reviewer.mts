import type { Logger } from 'winston';
import type { CodeFile, TaskGraph, Task } from '../types/index.mts';

/**
 * Playwright callbacks for the page reviewer.
 */
export interface ReviewerPlaywrightCallbacks {
  navigate(url: string): Promise<void>;
  snapshot(): Promise<string>;
  screenshot(): Promise<string>;
}

/**
 * Result of reviewing a single page/route.
 */
export interface PageReviewResult {
  readonly route: string;
  readonly pageName: string;
  readonly navigated: boolean;
  readonly navigationError: string | undefined;
  readonly elementsFound: readonly ReviewedElement[];
  readonly missingElements: readonly string[];
  readonly passed: boolean;
  readonly screenshotPath: string;
}

export interface ReviewedElement {
  readonly role: string;
  readonly name: string;
  readonly found: boolean;
}

/**
 * Full review report across all pages.
 */
export interface SpaReviewReport {
  readonly totalPages: number;
  readonly passedPages: number;
  readonly failedPages: number;
  readonly pageResults: readonly PageReviewResult[];
  readonly overallPassed: boolean;
}

/**
 * Runs a comprehensive review of the generated SPA by navigating to
 * every page/route and verifying that key HTML elements and components
 * are present and accessible.
 *
 * Flow:
 *   1. Extract routes from the generated code (route configs, task graph)
 *   2. Start the dev server
 *   3. For each route:
 *      a. Navigate via Playwright
 *      b. Take accessibility snapshot
 *      c. Verify expected elements exist (based on task type / component names)
 *      d. Take screenshot
 *      e. Record pass/fail
 *   4. Return full review report
 */
export async function reviewSpaPages(
  baseUrl: string,
  generatedFiles: readonly CodeFile[],
  taskGraph: TaskGraph | undefined,
  logger: Logger,
  pw: ReviewerPlaywrightCallbacks,
): Promise<SpaReviewReport> {
  logger.info(`\n========== SPA Page Review ==========`);

  // ── Step 1: Extract routes ────────────────────────────────────
  const routes = extractRoutes(generatedFiles, taskGraph);
  logger.info(`Extracted ${routes.length} routes to review`, {
    routes: routes.map((r) => r.route),
  });

  if (routes.length === 0) {
    logger.warn(`No routes found to review`);
    return { totalPages: 0, passedPages: 0, failedPages: 0, pageResults: [], overallPassed: false };
  }

  // ── Step 2: Review each route ─────────────────────────────────
  const pageResults: PageReviewResult[] = [];

  for (const routeInfo of routes) {
    const result = await reviewSinglePage(baseUrl, routeInfo, logger, pw);
    pageResults.push(result);

    const icon = result.passed ? `✅` : `❌`;
    logger.info(`${icon} ${result.route} — ${result.pageName}`, {
      elements: result.elementsFound.length,
      missing: result.missingElements.length,
      passed: result.passed,
    });
  }

  // ── Step 3: Compile report ────────────────────────────────────
  const passedPages = pageResults.filter((r) => r.passed).length;
  const failedPages = pageResults.filter((r) => !r.passed).length;

  const report: SpaReviewReport = {
    totalPages: pageResults.length,
    passedPages,
    failedPages,
    pageResults,
    overallPassed: failedPages === 0,
  };

  logger.info(`\nReview complete: ${passedPages}/${report.totalPages} pages passed`);

  if (failedPages > 0) {
    logger.warn(`Failed pages:`);
    for (const result of pageResults.filter((r) => !r.passed)) {
      logger.warn(`  ${result.route} — missing: ${result.missingElements.join(`, `)}`);
    }
  }

  return report;
}

// ── Route extraction ────────────────────────────────────────────────

interface RouteInfo {
  readonly route: string;
  readonly pageName: string;
  readonly expectedElements: readonly ExpectedElement[];
}

interface ExpectedElement {
  readonly role: string;
  readonly namePattern: string;
}

/**
 * Extract routes from generated code files and the task graph.
 *
 * Looks for:
 *   1. Route definitions in route config files (path: 'xxx')
 *   2. Task graph component tasks (each maps to a page)
 *   3. Common SPA routes (/, /login, /dashboard, etc.)
 */
function extractRoutes(
  files: readonly CodeFile[],
  taskGraph: TaskGraph | undefined,
): RouteInfo[] {
  const routes = new Map<string, RouteInfo>();

  // Always check the root route
  routes.set(`/`, {
    route: `/`,
    pageName: `Landing Page`,
    expectedElements: [
      { role: `heading`, namePattern: `.*` },
      { role: `link`, namePattern: `.*` },
      { role: `button`, namePattern: `.*` },
    ],
  });

  // Extract from route config files
  for (const file of files) {
    if (file.path.includes(`route`) || file.path.includes(`routing`)) {
      const pathMatches = file.content.matchAll(/path:\s*['"`]([^'"`]+)['"`]/g);
      for (const match of pathMatches) {
        const path = match[1];
        if (path && path !== `**` && path !== ``) {
          const route = `/${path.replace(/^\//, ``)}`;
          if (!routes.has(route)) {
            routes.set(route, {
              route,
              pageName: pathToPageName(path),
              expectedElements: inferExpectedElements(path),
            });
          }
        }
      }
    }
  }

  // Extract from task graph — component tasks map to routes
  if (taskGraph) {
    for (const task of taskGraph.tasks) {
      if (task.type === `component` || task.type === `layout`) {
        const route = taskToRoute(task);
        if (route && !routes.has(route)) {
          routes.set(route, {
            route,
            pageName: task.name,
            expectedElements: inferExpectedElementsFromTask(task),
          });
        }
      }
    }
  }

  // Add common routes that might not be in configs yet
  const commonRoutes: RouteInfo[] = [
    { route: `/login`, pageName: `Login Page`, expectedElements: [
      { role: `textbox`, namePattern: `email|username` },
      { role: `button`, namePattern: `login|sign.in|submit` },
    ]},
    { route: `/dashboard`, pageName: `Dashboard`, expectedElements: [
      { role: `heading`, namePattern: `dashboard|overview|welcome` },
      { role: `navigation`, namePattern: `.*` },
    ]},
  ];

  for (const common of commonRoutes) {
    if (!routes.has(common.route)) {
      routes.set(common.route, common);
    }
  }

  return [...routes.values()];
}

// ── Single page review ──────────────────────────────────────────────

async function reviewSinglePage(
  baseUrl: string,
  routeInfo: RouteInfo,
  logger: Logger,
  pw: ReviewerPlaywrightCallbacks,
): Promise<PageReviewResult> {
  const fullUrl = `${baseUrl}${routeInfo.route}`;

  // Navigate
  let navigated = false;
  let navigationError: string | undefined;
  try {
    await pw.navigate(fullUrl);
    navigated = true;
  } catch (error) {
    navigationError = error instanceof Error ? error.message : String(error);
    logger.warn(`Navigation failed for ${routeInfo.route}`, { error: navigationError });
  }

  if (!navigated) {
    return {
      route: routeInfo.route,
      pageName: routeInfo.pageName,
      navigated: false,
      navigationError,
      elementsFound: [],
      missingElements: routeInfo.expectedElements.map((e) => `${e.role}:${e.namePattern}`),
      passed: false,
      screenshotPath: ``,
    };
  }

  // Take snapshot
  let snapshotText = ``;
  try {
    snapshotText = await pw.snapshot();
  } catch (error) {
    logger.warn(`Snapshot failed for ${routeInfo.route}`, {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Take screenshot
  let screenshotPath = ``;
  try {
    screenshotPath = await pw.screenshot();
  } catch {
    // Non-critical
  }

  // Verify expected elements
  const elementsFound: ReviewedElement[] = [];
  const missingElements: string[] = [];
  const pageElements = parsePageElements(snapshotText);

  for (const expected of routeInfo.expectedElements) {
    const pattern = new RegExp(expected.namePattern, `i`);
    const found = pageElements.some(
      (el) => el.role.toLowerCase() === expected.role.toLowerCase() && pattern.test(el.name),
    );

    elementsFound.push({
      role: expected.role,
      name: expected.namePattern,
      found,
    });

    if (!found) {
      missingElements.push(`${expected.role}:${expected.namePattern}`);
    }
  }

  // A page passes if:
  // 1. Navigation succeeded
  // 2. The snapshot has meaningful content (not just an error page)
  // 3. At least 50% of expected elements are found (some may be behind auth)
  const foundCount = elementsFound.filter((e) => e.found).length;
  const threshold = Math.max(1, Math.ceil(routeInfo.expectedElements.length * 0.5));
  const hasContent = snapshotText.length > 100;
  const passed = navigated && hasContent && foundCount >= threshold;

  return {
    route: routeInfo.route,
    pageName: routeInfo.pageName,
    navigated,
    navigationError: undefined,
    elementsFound,
    missingElements,
    passed,
    screenshotPath,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────

function parsePageElements(snapshotText: string): { role: string; name: string }[] {
  const elements: { role: string; name: string }[] = [];
  const pattern = /^\s*-?\s*(heading|button|link|textbox|img|navigation|main|banner|table|cell|row|menuitem|tab|tabpanel|checkbox|radio|combobox|slider|progressbar|alert|dialog|list|listitem|form|region|complementary|contentinfo)\s+["']([^"']+)["']/gim;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(snapshotText)) !== null) {
    if (match[1] && match[2]) {
      elements.push({ role: match[1], name: match[2] });
    }
  }

  return elements;
}

function pathToPageName(path: string): string {
  return path
    .replace(/[/:]/g, ` `)
    .replace(/\s+/g, ` `)
    .trim()
    .split(` `)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(` `) || `Page`;
}

function taskToRoute(task: Task): string | null {
  const name = task.name.toLowerCase();
  if (name.includes(`dashboard`)) return `/dashboard`;
  if (name.includes(`login`)) return `/login`;
  if (name.includes(`roster`) || name.includes(`list`)) return `/athletes`;
  if (name.includes(`detail`) || name.includes(`profile`)) return `/athletes/1`;
  if (name.includes(`training`) && name.includes(`plan`)) return `/training-plans`;
  if (name.includes(`workout`) && name.includes(`log`)) return `/workouts/new`;
  if (name.includes(`performance`)) return `/performance`;
  if (name.includes(`nutrition`)) return `/nutrition`;
  if (name.includes(`setting`)) return `/settings`;
  return null;
}

function inferExpectedElements(path: string): ExpectedElement[] {
  const elements: ExpectedElement[] = [
    { role: `heading`, namePattern: `.*` },
  ];

  if (path.includes(`login`)) {
    elements.push({ role: `textbox`, namePattern: `email|username|password` });
    elements.push({ role: `button`, namePattern: `login|sign|submit` });
  }
  if (path.includes(`dashboard`)) {
    elements.push({ role: `navigation`, namePattern: `.*` });
  }
  if (path.includes(`athlete`) || path.includes(`roster`)) {
    elements.push({ role: `table`, namePattern: `.*` });
  }
  if (path.includes(`workout`) || path.includes(`nutrition`)) {
    elements.push({ role: `button`, namePattern: `save|submit|add|log` });
  }
  if (path.includes(`setting`)) {
    elements.push({ role: `button`, namePattern: `save|update` });
  }

  return elements;
}

function inferExpectedElementsFromTask(task: Task): ExpectedElement[] {
  const elements: ExpectedElement[] = [
    { role: `heading`, namePattern: `.*` },
  ];

  const name = task.name.toLowerCase();
  if (name.includes(`table`) || name.includes(`roster`) || name.includes(`list`)) {
    elements.push({ role: `table`, namePattern: `.*` });
  }
  if (name.includes(`form`) || name.includes(`builder`) || name.includes(`logger`)) {
    elements.push({ role: `textbox`, namePattern: `.*` });
    elements.push({ role: `button`, namePattern: `save|submit|create|add` });
  }
  if (name.includes(`dashboard`)) {
    elements.push({ role: `navigation`, namePattern: `.*` });
  }
  if (name.includes(`chart`) || name.includes(`metric`) || name.includes(`performance`)) {
    elements.push({ role: `img`, namePattern: `.*` });
  }

  return elements;
}
