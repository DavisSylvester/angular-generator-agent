import type { Logger } from 'winston';
import type { VisualFidelityAgent, FidelityCheckResult } from '../agents/visual-fidelity-agent.mts';
import type { CostTracker } from '../llm/cost-tracker.mts';
import type { SelectedDesign, ComponentLibrary } from '../types/index.mts';

export interface FidelityPlaywrightCallbacks {
  navigate(url: string): Promise<void>;
  screenshot(): Promise<string>;
}

export interface VisualFidelityReport {
  readonly pages: readonly FidelityCheckResult[];
  readonly overallMatch: boolean;
  readonly averageScore: number;
  readonly pagesNeedingFix: readonly string[];
}

interface PageToCheck {
  readonly route: string;
  readonly pageName: string;
}

/**
 * Runs visual fidelity checks on the built SPA by comparing each page
 * against the Stitch design using a multimodal LLM.
 *
 * Flow:
 *   1. Navigate to the Stitch design URL and take a screenshot
 *   2. For each app page:
 *      a. Navigate to the page and take a screenshot
 *      b. Send both screenshots + color palette to the fidelity agent
 *      c. Agent scores color, layout, component, and typography match (1-10)
 *      d. If score < 7, flag for regeneration with fix instructions
 *   3. Return a full fidelity report
 */
export async function runVisualFidelityReview(
  appBaseUrl: string,
  selectedDesign: SelectedDesign,
  componentLibrary: ComponentLibrary,
  fidelityAgent: VisualFidelityAgent,
  costTracker: CostTracker,
  logger: Logger,
  pw: FidelityPlaywrightCallbacks,
): Promise<VisualFidelityReport> {
  logger.info(`\n========== Visual Fidelity Review ==========`);
  logger.info(`Comparing built app against Stitch design: ${selectedDesign.chosen.previewUrl}`);

  // ── Step 1: Capture Stitch design screenshot ──────────────────
  let stitchScreenshot = ``;
  try {
    await pw.navigate(selectedDesign.chosen.previewUrl);
    stitchScreenshot = await pw.screenshot();
    logger.info(`Captured Stitch design screenshot`);
  } catch (error) {
    logger.warn(`Could not capture Stitch design screenshot`, {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // ── Step 2: Extract color palette from design tokens ──────────
  const colorPalette = extractColorPalette(componentLibrary.designTokens.content);
  logger.info(`Color palette extracted`, colorPalette);

  // ── Step 3: Define pages to check ─────────────────────────────
  const pages: PageToCheck[] = [
    { route: `/dashboard`, pageName: `Dashboard` },
    { route: `/athletes`, pageName: `Athlete Roster` },
    { route: `/athletes/1`, pageName: `Athlete Detail` },
    { route: `/training-plans`, pageName: `Training Plan Builder` },
    { route: `/workouts/new`, pageName: `Workout Logger` },
    { route: `/performance`, pageName: `Performance Dashboard` },
    { route: `/nutrition`, pageName: `Nutrition Tracker` },
    { route: `/settings`, pageName: `Settings` },
  ];

  // ── Step 4: Check each page ───────────────────────────────────
  const results: FidelityCheckResult[] = [];

  for (const page of pages) {
    logger.info(`Checking fidelity: ${page.pageName} (${page.route})`);

    let appScreenshot = ``;
    try {
      await pw.navigate(`${appBaseUrl}${page.route}`);
      appScreenshot = await pw.screenshot();
    } catch (error) {
      logger.warn(`Could not capture app screenshot for ${page.route}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const checkResult = await fidelityAgent.run({
      pageName: page.pageName,
      pageRoute: page.route,
      stitchDesignUrl: selectedDesign.chosen.previewUrl,
      stitchDesignDescription: selectedDesign.chosen.description,
      appScreenshotBase64: appScreenshot,
      stitchScreenshotBase64: stitchScreenshot,
      designTokensSCSS: componentLibrary.designTokens.content,
      colorPalette,
    });

    if (checkResult.ok) {
      const result = checkResult.value.result;
      results.push(result);

      costTracker.record(
        checkResult.value.model,
        checkResult.value.tokenUsage.inputTokens,
        checkResult.value.tokenUsage.outputTokens,
        `fidelity-${page.route}`,
      );

      const icon = result.matches ? `✅` : `❌`;
      logger.info(`${icon} ${page.pageName}: ${result.overallScore}/10`, {
        color: result.colorSchemeScore,
        layout: result.layoutScore,
        components: result.componentScore,
        typography: result.typographyScore,
        issues: result.issues.length,
      });

      if (!result.matches && result.fixInstructions) {
        logger.warn(`Fix needed for ${page.pageName}:`, {
          instructions: result.fixInstructions.slice(0, 200),
        });
      }
    } else {
      logger.warn(`Fidelity check failed for ${page.pageName}: ${checkResult.error.message}`);
      results.push({
        pageName: page.pageName,
        overallScore: 0,
        matches: false,
        colorSchemeScore: 0,
        layoutScore: 0,
        componentScore: 0,
        typographyScore: 0,
        issues: [{ severity: `critical`, category: `layout`, description: `Fidelity check failed`, expected: `Stitch design`, actual: `Error`, fix: checkResult.error.message }],
        fixInstructions: `Regenerate ${page.pageName} component with explicit Stitch design reference.`,
      });
    }
  }

  // ── Step 5: Compile report ────────────────────────────────────
  const averageScore = results.length > 0
    ? results.reduce((sum, r) => sum + r.overallScore, 0) / results.length
    : 0;

  const pagesNeedingFix = results
    .filter((r) => !r.matches)
    .map((r) => `${r.pageName} (${r.overallScore}/10)`);

  const report: VisualFidelityReport = {
    pages: results,
    overallMatch: pagesNeedingFix.length === 0,
    averageScore: Math.round(averageScore * 10) / 10,
    pagesNeedingFix,
  };

  logger.info(`\nVisual Fidelity Summary: ${report.averageScore}/10 average`);
  logger.info(`  Matching pages: ${results.filter((r) => r.matches).length}/${results.length}`);

  if (pagesNeedingFix.length > 0) {
    logger.warn(`  Pages needing fix: ${pagesNeedingFix.join(`, `)}`);
  }

  return report;
}

/**
 * Extract hex colors from the SCSS design tokens.
 */
function extractColorPalette(scss: string): {
  primary: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
} {
  const findColor = (patterns: RegExp[]): string => {
    for (const pattern of patterns) {
      const match = pattern.exec(scss);
      if (match?.[1]) return match[1];
    }
    return ``;
  };

  return {
    primary: findColor([/--color-primary:\s*(#[0-9a-fA-F]+)/]),
    accent: findColor([/--color-accent:\s*(#[0-9a-fA-F]+)/, /--color-primary-light:\s*(#[0-9a-fA-F]+)/]),
    background: findColor([/--color-light-background:\s*(#[0-9a-fA-F]+)/, /--color-bg[^:]*:\s*(#[0-9a-fA-F]+)/]),
    surface: findColor([/--color-bg-card:\s*(#[0-9a-fA-F]+)/, /--color-surface:\s*(#[0-9a-fA-F]+)/]),
    text: findColor([/--color-text-dark:\s*(#[0-9a-fA-F]+)/, /--color-text-primary:\s*(#[0-9a-fA-F]+)/]),
  };
}
