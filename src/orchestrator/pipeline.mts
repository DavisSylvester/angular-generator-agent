import { readFile } from 'node:fs/promises';
import type { Logger } from 'winston';
import type { PlanningAgent } from '../agents/planning-agent.mts';
import type { CodegenAgent } from '../agents/codegen-agent.mts';
import type { ValidationAgent } from '../agents/validation-agent.mts';
import type { DesignSelectionAgent, DesignSelectionResult } from '../agents/design-selection-agent.mts';
import type { ComponentLibraryAgent } from '../agents/component-library-agent.mts';
import type { VisualFidelityAgent } from '../agents/visual-fidelity-agent.mts';
import type { LintValidator } from '../verification/lint-validator.mts';
import type { CostTracker } from '../llm/cost-tracker.mts';
import type { Workspace } from '../io/workspace.mts';
import type { ParallelExecutor } from '../graph/parallel-executor.mts';
import type { INotifier } from '../interfaces/i-notifier.mts';
import type { DribbbleScraper } from '../services/dribbble-scraper.mts';
import type { DribbbleApiClient } from '../services/dribbble-api-client.mts';
import type { StitchService } from '../services/stitch-service.mts';
import type {
  PipelineConfig,
  TaskGraph,
  TaskState,
  CodeFile,
  DribbbleDesign,
  StitchDesign,
  SelectedDesign,
  ComponentLibrary,
  StyleGuide,
} from '../types/index.mts';
import { runFixLoop } from './fix-loop.mts';
import { pickUserDesign } from './user-design-pick.mts';
import { saveDecisions } from './save-decisions.mts';
import { runBuildValidation } from './build-validation.mts';
import type { BuildValidationResult } from './build-validation.mts';
import { reviewSpaPages } from './page-reviewer.mts';
import type { SpaReviewReport } from './page-reviewer.mts';
import { runVisualFidelityReview } from './visual-fidelity-review.mts';
import type { VisualFidelityReport } from './visual-fidelity-review.mts';
import { extractStyleGuide } from './style-guide-extraction.mts';
import { runPreflightChecks } from './preflight-deps.mts';
import type { PreflightReport } from './preflight-deps.mts';

// ── Dependency interfaces ───────────────────────────────────────────

export interface PipelineDeps {
  readonly logger: Logger;
  readonly planningAgent: PlanningAgent;
  readonly codegenAgent: CodegenAgent;
  readonly validationAgent: ValidationAgent;
  readonly designSelectionAgent: DesignSelectionAgent;
  readonly componentLibraryAgent: ComponentLibraryAgent;
  readonly visualFidelityAgent: VisualFidelityAgent;
  readonly lintValidator: LintValidator;
  readonly costTracker: CostTracker;
  readonly workspace: Workspace;
  readonly executor: ParallelExecutor;
  readonly notifier: INotifier;
  readonly dribbbleScraper: DribbbleScraper;
  readonly dribbbleApiClient: DribbbleApiClient | undefined;
  readonly stitchService: StitchService;
}

/**
 * Playwright callbacks injected by the caller. Each maps to one
 * Playwright MCP tool call. The pipeline never imports Playwright
 * directly — the caller wires these up.
 */
export interface PlaywrightCallbacks {
  navigate(url: string): Promise<void>;
  snapshot(): Promise<string>;
  screenshot(): Promise<string>;
  openTab(url: string): Promise<void>;
  runCommand(cmd: string, args: string[], cwd: string): Promise<{ exitCode: number; stdout: string; stderr: string }>;
}

interface PipelineInput {
  readonly prdContent: string;
  readonly runId: string;
  readonly resumeRunId?: string | undefined;
  readonly projectTitle: string;
  readonly projectScope: string;
}

export interface PipelineResult {
  readonly runId: string;
  readonly preflightReport: PreflightReport;
  readonly taskResults: Map<string, TaskState>;
  readonly files: CodeFile[];
  readonly selectedDesign: SelectedDesign | undefined;
  readonly styleGuide: StyleGuide | undefined;
  readonly componentLibrary: ComponentLibrary | undefined;
  readonly buildValidation: BuildValidationResult | undefined;
  readonly spaReview: SpaReviewReport | undefined;
  readonly visualFidelity: VisualFidelityReport | undefined;
  readonly totalCost: number;
  readonly durationMs: number;
}

// ── Main pipeline ───────────────────────────────────────────────────

export async function runPipeline(
  input: PipelineInput,
  config: PipelineConfig,
  deps: PipelineDeps,
  pw: PlaywrightCallbacks,
): Promise<PipelineResult> {
  const {
    logger, planningAgent, codegenAgent, validationAgent,
    designSelectionAgent, componentLibraryAgent,
    lintValidator, costTracker, workspace, executor, notifier,
    dribbbleScraper, dribbbleApiClient, stitchService,
  } = deps;
  const { prdContent, runId, projectTitle, projectScope } = input;
  const startMs = Date.now();

  // ── Preflight: Dependency Check ───────────────────────────────
  const preflightReport = await runPreflightChecks(pw, logger, {
    googleApiKey: config.googleApiKey,
    skipPlaywrightTest: false,
  });

  if (!preflightReport.passed) {
    logger.error(`Aborting pipeline — critical dependencies missing`);
    return {
      runId,
      preflightReport,
      taskResults: new Map(),
      files: [],
      selectedDesign: undefined,
      styleGuide: undefined,
      componentLibrary: undefined,
      buildValidation: undefined,
      spaReview: undefined,
      visualFidelity: undefined,
      totalCost: costTracker.getTotalCost(),
      durationMs: Date.now() - startMs,
    };
  }

  // ── Phase 0: Workspace Setup ──────────────────────────────────
  logger.info(`\n========== Phase 0: Workspace Setup ==========`);
  await workspace.init(runId);

  await workspace.saveConfig(runId, {
    runId,
    projectTitle,
    projectScope,
    maxFixIterations: config.maxFixIterations,
    maxConcurrency: config.maxConcurrency,
    maxTasks: config.maxTasks,
    startedAt: new Date().toISOString(),
  });

  // Load API spec if provided (output from api-generator-agent)
  let apiSpec = ``;
  if (config.apiSpecPath) {
    try {
      apiSpec = await readFile(config.apiSpecPath, `utf-8`);
      logger.info(`Loaded API spec from ${config.apiSpecPath}`, { chars: apiSpec.length });
    } catch (error) {
      logger.warn(`Could not load API spec`, {
        path: config.apiSpecPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Load completed task IDs if resuming
  const completedTaskIds = new Set<string>();
  if (input.resumeRunId) {
    const existingStates = await workspace.getRunStatus(input.resumeRunId);
    for (const [taskId, state] of Object.entries(existingStates)) {
      if (state.status === `completed`) {
        completedTaskIds.add(taskId);
      }
    }
    logger.info(`Resuming run: ${completedTaskIds.size} tasks already completed`);
  }

  // ── Phase 1: Design Search (Dribbble + LLM Selection) ─────────
  // NOTE: Dribbble search is a HARD requirement. Pipeline aborts if it fails.
  //
  // Strategy: API client (stable) → Playwright scraper (fallback) → cache (last resort)
  logger.info(`\n========== Phase 1: Design Search ==========`);

  const designCacheKey = await hashContent(`${projectTitle}::${projectScope}`);
  const queries = dribbbleScraper.buildSearchQueries(projectTitle, projectScope);
  logger.info(`Searching Dribbble with ${queries.length} queries`, { queries });

  let dribbbleDesigns: DribbbleDesign[] | undefined;

  // 1a. Try Dribbble API client (most reliable — no DOM parsing)
  if (dribbbleApiClient) {
    logger.info(`Attempting Dribbble API search (token configured)...`);
    const apiResult = await dribbbleApiClient.search(queries);
    if (apiResult.ok && apiResult.value.length > 0) {
      dribbbleDesigns = apiResult.value;
      logger.info(`Dribbble API returned ${dribbbleDesigns.length} designs`);
    } else {
      logger.warn(`Dribbble API search failed, falling back to Playwright scraper`, {
        error: apiResult.ok ? `zero results` : apiResult.error.message,
      });
    }
  }

  // 1b. Fallback to Playwright scraper
  if (!dribbbleDesigns) {
    logger.info(`Attempting Dribbble Playwright scraper...`);
    const scrapeResult = await dribbbleScraper.search(
      queries,
      pw.navigate,
      pw.snapshot,
      pw.screenshot,
    );
    if (scrapeResult.ok && scrapeResult.value.length > 0) {
      dribbbleDesigns = scrapeResult.value;
      logger.info(`Dribbble scraper returned ${dribbbleDesigns.length} designs`);
    } else {
      logger.warn(`Dribbble scraper also failed`, {
        error: scrapeResult.ok ? `zero results` : scrapeResult.error.message,
      });
    }
  }

  // 1c. Last resort — check design cache from a previous run
  if (!dribbbleDesigns) {
    logger.warn(`Both Dribbble sources failed, checking design cache...`);
    const cached = await workspace.loadCachedDribbbleDesigns(designCacheKey);
    if (cached && cached.length > 0) {
      dribbbleDesigns = cached;
      logger.info(`Loaded ${cached.length} cached Dribbble designs (from prior run)`);
    }
  }

  // Hard gate — abort if no designs from any source
  if (!dribbbleDesigns || dribbbleDesigns.length === 0) {
    logger.error(`Aborting pipeline — Dribbble search failed from all sources (API, scraper, cache)`);
    return buildResult(runId, preflightReport, new Map(), [], undefined, undefined, undefined, undefined, undefined, undefined, costTracker, startMs);
  }

  // Cache successful results for future runs
  await workspace.saveCachedDribbbleDesigns(designCacheKey, dribbbleDesigns);

  let inspiration: DribbbleDesign | undefined;
  let designNotes: DesignSelectionResult[`designNotes`] = {
    colorPalette: `Professional blue palette`,
    layoutPattern: `sidebar-nav`,
    keyComponents: [`data-table`, `sidebar`, `card`, `form`],
  };

  // LLM selects the best design
  const selectionResult = await designSelectionAgent.run({
    designs: dribbbleDesigns,
    prdContent,
    projectTitle,
    projectScope,
  });

  if (selectionResult.ok) {
    const sel = selectionResult.value.result;
    inspiration = dribbbleDesigns[sel.selectedIndex];
    designNotes = sel.designNotes;

    costTracker.record(
      selectionResult.value.model,
      selectionResult.value.tokenUsage.inputTokens,
      selectionResult.value.tokenUsage.outputTokens,
      `design-selection`,
    );

    logger.info(`LLM selected design: "${sel.selectedTitle}"`, {
      index: sel.selectedIndex,
      reasoning: sel.reasoning,
    });
  } else {
    logger.warn(`Design selection LLM failed, using first result as fallback`, {
      error: selectionResult.error.message,
    });
    inspiration = dribbbleDesigns[0];
  }

  // ── Phase 2: Design Creation (Stitch + User Pick) ─────────────
  // NOTE: Google Stitch is a HARD requirement. Pipeline aborts if it fails.
  //
  // Strategy: live Stitch generation → cache (last resort)
  logger.info(`\n========== Phase 2: Design Creation (Google Stitch) ==========`);

  let stitchDesigns: StitchDesign[] | undefined;

  // 2a. Try live Stitch generation (already has per-submission retry built in)
  const stitchResult = await stitchService.generateDesigns(
    inspiration!,
    prdContent,
    projectTitle,
    designNotes,
    {
      navigate: pw.navigate,
      snapshot: pw.snapshot,
      screenshot: pw.screenshot,
      fill: async () => { /* wired by caller */ },
      click: async () => { /* wired by caller */ },
      waitFor: async (ms) => new Promise((r) => setTimeout(r, ms)),
    },
  );

  if (stitchResult.ok && stitchResult.value.length > 0) {
    stitchDesigns = stitchResult.value;
    logger.info(`Generated ${stitchDesigns.length} Stitch designs`);
  } else {
    logger.warn(`Stitch live generation failed`, {
      error: stitchResult.ok ? `zero designs generated` : stitchResult.error.message,
    });
  }

  // 2b. Last resort — check design cache from a previous run
  if (!stitchDesigns) {
    logger.warn(`Stitch generation failed, checking design cache...`);
    const cached = await workspace.loadCachedStitchDesigns(designCacheKey);
    if (cached && cached.length > 0) {
      stitchDesigns = cached;
      logger.info(`Loaded ${cached.length} cached Stitch designs (from prior run)`);
    }
  }

  // Hard gate — abort if no Stitch designs from any source
  if (!stitchDesigns || stitchDesigns.length === 0) {
    logger.error(`Aborting pipeline — Stitch design generation failed from all sources (live, cache)`);
    return buildResult(runId, preflightReport, new Map(), [], undefined, undefined, undefined, undefined, undefined, undefined, costTracker, startMs);
  }

  // Cache successful results for future runs
  await workspace.saveCachedStitchDesigns(designCacheKey, stitchDesigns);

  logger.info(`${stitchDesigns.length} Stitch designs available, opening in browser tabs...`);

  // Track all design URLs for decisions doc
  const allDesignUrls = stitchDesigns.map((d) => ({ name: d.name, url: d.previewUrl }));

  const chosenDesign = await pickUserDesign(
    stitchDesigns,
    logger,
    { openTab: pw.openTab, screenshot: pw.screenshot },
  );

  logger.info(`User selected: "${chosenDesign.name}" (${chosenDesign.id})`);

  const selectedDesign: SelectedDesign = { source: `stitch`, inspiration: inspiration!, chosen: chosenDesign };

  // ── Phase 2a: Style Guide Extraction (Box Model Decomposition) ──
  let styleGuide: StyleGuide | undefined;

  if (config.googleApiKey) {
    logger.info(`\n========== Phase 2a: Style Guide Extraction ==========`);

    const sgResult = await extractStyleGuide(
      chosenDesign,
      config.googleApiKey,
      runId,
      logger,
      workspace,
      costTracker,
      { navigate: pw.navigate, screenshot: pw.screenshot },
    );

    if (sgResult.ok) {
      styleGuide = sgResult.value;
      logger.info(`Style guide extracted — ${styleGuide.elements.length} elements, ${styleGuide.colorPalette.length} colors`);
    } else {
      logger.warn(`Style guide extraction failed: ${sgResult.error.message}`);
      logger.info(`Proceeding without style guide — component library will use design notes only`);
    }
  } else {
    logger.info(`Skipping style guide extraction — no Google API key configured`);
  }

  // ── Phase 2b: Save Decisions ──────────────────────────────────
  logger.info(`\n========== Phase 2b: Save Decisions ==========`);
  const decisionsOutputDir = `${config.workspaceDir}/${runId}/output`;
  await saveDecisions(decisionsOutputDir, {
    runId,
    projectTitle,
    framework: config.framework,
    selectedDesign,
    componentLibrary: undefined, // Updated after Phase 3
    allDesignUrls,
  }, logger);

  // ── Phase 3: Component Library ────────────────────────────────
  logger.info(`\n========== Phase 3: Component Library (${config.framework}) ==========`);

  let componentLibrary: ComponentLibrary | undefined;

  const libResult = await componentLibraryAgent.run({
    inspiration: selectedDesign.inspiration,
    chosenDesign: selectedDesign.chosen,
    designNotes,
    prdContent,
    projectTitle,
    styleGuide,
  });

  if (libResult.ok) {
    componentLibrary = libResult.value.result;
    costTracker.record(
      libResult.value.model,
      libResult.value.tokenUsage.inputTokens,
      libResult.value.tokenUsage.outputTokens,
      `component-library`,
    );

    // Write component library files to workspace
    const tokenFile = componentLibrary.designTokens;
    await workspace.saveCodeFile(runId, {
      path: tokenFile.path,
      content: tokenFile.content,
      fileType: `styles`,
    });

    for (const comp of componentLibrary.components) {
      for (const file of comp.files) {
        await workspace.saveCodeFile(runId, {
          path: file.path,
          content: file.content,
          fileType: `other`,
        });
      }
    }

    logger.info(`Component library generated`, {
      tokens: 1,
      components: componentLibrary.components.length,
      files: componentLibrary.components.reduce((n, c) => n + c.files.length, 0),
    });
  } else {
    logger.warn(`Component library generation failed: ${libResult.error.message}`);
  }

  // Update decisions doc with color palette now that component library exists
  if (componentLibrary) {
    await saveDecisions(decisionsOutputDir, {
      runId,
      projectTitle,
      framework: config.framework,
      selectedDesign,
      componentLibrary,
      allDesignUrls,
    }, logger);
    logger.info(`Updated .doc/color-palette.md with extracted design tokens`);
  }

  // ── Phase 4: Planning + Code Generation ───────────────────────
  logger.info(`\n========== Phase 4: Code Generation ==========`);

  // Enrich the PRD with API spec, style guide, and component library context
  const enrichedPrd = buildEnrichedPrd(prdContent, apiSpec, componentLibrary, styleGuide);

  // 4a. Plan the task graph
  let plan: TaskGraph | null = null;
  const prdHash = await hashContent(enrichedPrd);
  const cachedPlan = await workspace.loadCachedPlan(prdHash);

  if (cachedPlan) {
    logger.info(`Using cached plan (PRD hash: ${prdHash.slice(0, 8)}...)`);
    plan = { ...cachedPlan, runId };
  } else if (input.resumeRunId) {
    plan = await workspace.loadPlan(input.resumeRunId);
  }

  if (!plan) {
    logger.info(`Generating Angular project plan from enriched PRD...`);
    const planResult = await planningAgent.run({ prdContent: enrichedPrd, runId });

    if (!planResult.ok) {
      logger.error(`Planning failed: ${planResult.error.message}`);
      return buildResult(runId, preflightReport, new Map(), [], selectedDesign, styleGuide, componentLibrary, undefined, undefined, undefined, costTracker, startMs);
    }

    plan = planResult.value.result;
    costTracker.record(
      planResult.value.model,
      planResult.value.tokenUsage.inputTokens,
      planResult.value.tokenUsage.outputTokens,
      `planning`,
    );
    await workspace.saveCachedPlan(prdHash, plan);
  }

  await workspace.savePlan(runId, plan);

  let tasks = [...plan.tasks];
  if (config.maxTasks > 0 && config.maxTasks < tasks.length) {
    tasks = tasks.slice(0, config.maxTasks);
    logger.info(`Trimmed to ${config.maxTasks} tasks`);
  }
  logger.info(`Plan contains ${tasks.length} Angular tasks`);

  // 4b. Execute task graph with fix-loop
  const allFiles: CodeFile[] = [];
  const filesByTask = new Map<string, CodeFile[]>();

  // Collect component library files as context for codegen
  const libraryFiles: CodeFile[] = [];
  if (componentLibrary) {
    libraryFiles.push({
      path: componentLibrary.designTokens.path,
      content: componentLibrary.designTokens.content,
      fileType: `styles`,
    });
    for (const comp of componentLibrary.components) {
      for (const file of comp.files) {
        libraryFiles.push({ path: file.path, content: file.content, fileType: `other` });
      }
    }
  }

  const taskResults = await executor.execute(
    tasks,
    async (task) => {
      await notifier.notifyTaskStarted(task.id, task.name);

      // Gather existing files from completed dependencies + component library
      const existingFiles: CodeFile[] = [...libraryFiles];
      for (const depId of task.dependsOn) {
        const depFiles = filesByTask.get(depId);
        if (depFiles) {
          existingFiles.push(...depFiles);
        }
      }

      const { state, files } = await runFixLoop(
        {
          runId,
          task,
          prdContent: enrichedPrd,
          maxIterations: config.maxFixIterations,
          taskCostLimit: config.taskCostLimit,
          existingFiles,
          noValidate: config.noValidate,
        },
        { codegenAgent, validationAgent, lintValidator, costTracker, workspace, logger },
      );

      filesByTask.set(task.id, files);
      allFiles.push(...files);

      if (state.status === `completed`) {
        await notifier.notifyTaskCompleted(task.id, task.name);
      } else {
        await notifier.notifyTaskFailed(task.id, task.name, state.lastError ?? `Unknown error`);
      }

      return state;
    },
    { concurrency: config.maxConcurrency, completedTaskIds },
  );

  // ── Phase 5: Build & Validation (Playwright) ──────────────────
  logger.info(`\n========== Phase 5: Build & Validation ==========`);

  let buildValidation: BuildValidationResult | undefined;

  const validationResult = await runBuildValidation(
    decisionsOutputDir,
    config.playwrightValidationElements,
    logger,
    pw.navigate,
    pw.snapshot,
    pw.screenshot,
    pw.runCommand,
  );

  if (validationResult.ok) {
    buildValidation = validationResult.value;
    if (buildValidation.buildSuccess && buildValidation.passedCount >= config.playwrightValidationElements) {
      logger.info(`Build validation PASSED`);
    } else {
      logger.warn(`Build validation completed with issues`, {
        buildSuccess: buildValidation.buildSuccess,
        elementsFound: buildValidation.passedCount,
        required: config.playwrightValidationElements,
      });
    }
  } else {
    logger.error(`Build validation failed: ${validationResult.error.message}`);
  }

  // ── Phase 5b: SPA Page & Component Review ─────────────────────
  logger.info(`\n========== Phase 5b: SPA Page & Component Review ==========`);

  let spaReview: SpaReviewReport | undefined;
  let visualFidelity: VisualFidelityReport | undefined;
  const appBaseUrl = `http://localhost:4200`;

  if (buildValidation?.buildSuccess) {
    spaReview = await reviewSpaPages(
      appBaseUrl,
      allFiles,
      plan ?? undefined,
      logger,
      { navigate: pw.navigate, snapshot: pw.snapshot, screenshot: pw.screenshot },
    );

    // ── Phase 5c: Visual Fidelity Review (LLM compares Stitch vs App) ──
    if (selectedDesign && componentLibrary) {
      visualFidelity = await runVisualFidelityReview(
        appBaseUrl,
        selectedDesign,
        componentLibrary,
        deps.visualFidelityAgent,
        costTracker,
        logger,
        { navigate: pw.navigate, screenshot: pw.screenshot },
      );

      if (!visualFidelity.overallMatch) {
        logger.warn(`Visual fidelity check FAILED — ${visualFidelity.pagesNeedingFix.length} pages need fixes`);
        logger.warn(`Average fidelity score: ${visualFidelity.averageScore}/10`);

        // Save fix instructions to knowledge base for next run
        for (const page of visualFidelity.pages) {
          if (!page.matches && page.fixInstructions) {
            logger.warn(`Fix for ${page.pageName}: ${page.fixInstructions.slice(0, 200)}`);
          }
        }
      } else {
        logger.info(`Visual fidelity PASSED — ${visualFidelity.averageScore}/10 average score`);
      }
    }
  } else {
    logger.warn(`Skipping SPA review — build did not succeed`);
  }

  // ── Phase 6: Summary ──────────────────────────────────────────
  logger.info(`\n========== Phase 6: Summary ==========`);

  if (spaReview) {
    logger.info(`SPA Review: ${spaReview.passedPages}/${spaReview.totalPages} pages passed`);
  }

  return buildResult(runId, preflightReport, taskResults, allFiles, selectedDesign, styleGuide, componentLibrary, buildValidation, spaReview, visualFidelity, costTracker, startMs);
}

// ── Helpers ─────────────────────────────────────────────────────────

function buildResult(
  runId: string,
  preflightReport: PreflightReport,
  taskResults: Map<string, TaskState>,
  files: CodeFile[],
  selectedDesign: SelectedDesign | undefined,
  styleGuide: StyleGuide | undefined,
  componentLibrary: ComponentLibrary | undefined,
  buildValidation: BuildValidationResult | undefined,
  spaReview: SpaReviewReport | undefined,
  visualFidelity: VisualFidelityReport | undefined,
  costTracker: CostTracker,
  startMs: number,
): PipelineResult {
  return {
    runId,
    preflightReport,
    taskResults,
    files,
    selectedDesign,
    styleGuide,
    componentLibrary,
    buildValidation,
    spaReview,
    visualFidelity,
    totalCost: costTracker.getTotalCost(),
    durationMs: Date.now() - startMs,
  };
}

function buildEnrichedPrd(
  prdContent: string,
  apiSpec: string,
  componentLibrary: ComponentLibrary | undefined,
  styleGuide: StyleGuide | undefined,
): string {
  const sections: string[] = [prdContent];

  if (apiSpec) {
    sections.push(
      `\n\n## API Specification (from api-generator-agent)\n\n` +
      `The Angular app consumes the following API:\n\n` +
      apiSpec.slice(0, 5000),
    );
  }

  if (styleGuide) {
    sections.push(
      `\n\n## Style Guide (extracted from selected design)\n\n` +
      `The following style guide was extracted via box model decomposition of the chosen Stitch design. ` +
      `ALL generated components MUST reference these exact values for colors, typography, spacing, and element dimensions. ` +
      `Do NOT deviate from these specs:\n\n` +
      styleGuide.rawMarkdown,
    );
  }

  if (componentLibrary) {
    const compNames = componentLibrary.components.map((c) => `- \`<${c.selector}>\` (${c.category})`).join(`\n`);
    sections.push(
      `\n\n## Component Library (pre-generated)\n\n` +
      `The following shared components are already available in \`src/app/shared/\`. ` +
      `Import and use them — do NOT recreate them:\n\n` +
      compNames + `\n\n` +
      `Design tokens are in \`${componentLibrary.designTokens.path}\`. ` +
      `All SCSS files should \`@use\` the tokens file for colors, spacing, and typography.`,
    );
  }

  return sections.join(``);
}

async function hashContent(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest(`SHA-256`, data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, `0`)).join(``);
}
