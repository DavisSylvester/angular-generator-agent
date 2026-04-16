#!/usr/bin/env bun
import { ulid } from 'ulid';
import { createLogger, format, transports } from 'winston';
import { parseArgs } from './cli/parse-args.mts';
import { loadEnv } from './config/env.mts';
import { createContainer } from './container/di.mts';
import { parsePrd } from './input/prd-parser.mts';
import { runPipeline } from './orchestrator/pipeline.mts';
import type { PlaywrightCallbacks } from './orchestrator/pipeline.mts';
import type { PipelineConfig } from './types/index.mts';

async function main(): Promise<void> {
  const options = parseArgs(process.argv);

  if (options.command.kind === `help`) {
    process.exit(0);
  }

  // Bootstrap logger for env validation
  const bootLogger = createLogger({
    level: `info`,
    format: format.combine(format.colorize(), format.simple()),
    transports: [new transports.Console()],
  });

  const env = loadEnv(bootLogger);

  // Create DI container with CLI overrides
  const overrides: Record<string, unknown> = {
    noValidate: options.noValidate,
    apiSpecPath: options.apiSpecPath,
    framework: options.framework,
  };
  if (options.iterations !== undefined) overrides[`maxFixIterations`] = options.iterations;
  if (options.concurrency !== undefined) overrides[`maxConcurrency`] = options.concurrency;
  if (options.maxTasks !== undefined) overrides[`maxTasks`] = options.maxTasks;

  const container = createContainer(env, overrides as Partial<PipelineConfig>);
  const { logger, workspace, pipelineConfig } = container;

  // ── Handle non-pipeline commands ──────────────────────────────
  if (options.command.kind === `list-runs`) {
    const runs = await workspace.listRuns();
    if (runs.length === 0) {
      logger.info(`No previous runs found.`);
    } else {
      logger.info(`Previous runs:`);
      for (const run of runs) {
        logger.info(`  ${run}`);
      }
    }
    process.exit(0);
  }

  if (options.command.kind === `status`) {
    const states = await workspace.getRunStatus(options.command.runId);
    if (Object.keys(states).length === 0) {
      logger.info(`No tasks found for run: ${options.command.runId}`);
    } else {
      logger.info(`Task status for run: ${options.command.runId}`);
      for (const [taskId, state] of Object.entries(states)) {
        const icon = state.status === `completed` ? `✅` : state.status === `failed` ? `❌` : `⏳`;
        logger.info(`  ${icon} ${taskId}: ${state.status} (iteration ${state.iteration})`);
      }
    }
    process.exit(0);
  }

  // ── Run pipeline ──────────────────────────────────────────────
  const runId = ulid();

  let prdContent: string;
  let projectTitle: string;
  let projectScope: string;
  let resumeRunId: string | undefined;

  if (options.command.kind === `resume`) {
    resumeRunId = options.command.runId;
    const plan = await workspace.loadPlan(resumeRunId);
    if (!plan) {
      logger.error(`Cannot resume: no plan found for run ${resumeRunId}`);
      process.exit(1);
    }
    prdContent = `[Resumed from run ${resumeRunId}]`;
    projectTitle = `Resumed Project`;
    projectScope = `Resume`;
    logger.info(`Resuming run: ${resumeRunId} as new run: ${runId}`);
  } else {
    const prdResult = await parsePrd(options.command.prdPath, logger);
    if (!prdResult.ok) {
      logger.error(`Failed to parse PRD: ${prdResult.error.message}`);
      process.exit(1);
    }
    prdContent = prdResult.value.content;
    projectTitle = prdResult.value.title;
    projectScope = prdResult.value.sections.slice(0, 5).join(`, `);
    logger.info(`Loaded PRD: ${projectTitle} (${prdResult.value.sections.length} sections)`);
  }

  logger.info(`Starting Angular generation pipeline`, {
    runId,
    projectTitle,
    maxIterations: pipelineConfig.maxFixIterations,
    maxConcurrency: pipelineConfig.maxConcurrency,
    apiSpec: pipelineConfig.apiSpecPath ?? `none`,
  });

  // ── Playwright callbacks ──────────────────────────────────────
  // These wrap the Playwright MCP tools. When running inside Claude Code
  // or another MCP host, the caller wires these to the actual MCP calls.
  // In standalone mode, they are no-ops that log a warning.
  const pw: PlaywrightCallbacks = {
    navigate: async (url: string) => {
      logger.info(`[Playwright] Navigate: ${url}`);
      // MCP call: mcp__plugin_playwright_playwright__browser_navigate({ url })
    },
    snapshot: async () => {
      logger.info(`[Playwright] Snapshot`);
      // MCP call: mcp__plugin_playwright_playwright__browser_snapshot()
      return ``;
    },
    screenshot: async () => {
      logger.info(`[Playwright] Screenshot`);
      // MCP call: mcp__plugin_playwright_playwright__browser_take_screenshot()
      return ``;
    },
    openTab: async (url: string) => {
      logger.info(`[Playwright] Open tab: ${url}`);
      // MCP call: mcp__plugin_playwright_playwright__browser_tabs({ action: 'new' })
      // then: mcp__plugin_playwright_playwright__browser_navigate({ url })
    },
    runCommand: async (cmd: string, args: string[], cwd: string) => {
      logger.info(`[Shell] ${cmd} ${args.join(` `)}`, { cwd });
      try {
        const proc = Bun.spawn([cmd, ...args], { cwd, stdout: `pipe`, stderr: `pipe` });
        const [stdout, stderr, exitCode] = await Promise.all([
          new Response(proc.stdout).text(),
          new Response(proc.stderr).text(),
          proc.exited,
        ]);
        return { exitCode, stdout, stderr };
      } catch (error) {
        return {
          exitCode: 1,
          stdout: ``,
          stderr: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };

  const result = await runPipeline(
    { prdContent, runId, resumeRunId, projectTitle, projectScope },
    pipelineConfig,
    {
      logger: container.logger,
      planningAgent: container.planningAgent,
      codegenAgent: container.codegenAgent,
      validationAgent: container.validationAgent,
      designSelectionAgent: container.designSelectionAgent,
      componentLibraryAgent: container.componentLibraryAgent,
      visualFidelityAgent: container.visualFidelityAgent,
      lintValidator: container.lintValidator,
      costTracker: container.costTracker,
      workspace: container.workspace,
      executor: container.executor,
      notifier: container.notifier,
      dribbbleScraper: container.dribbbleScraper,
      stitchService: container.stitchService,
    },
    pw,
  );

  // ── Exit ──────────────────────────────────────────────────────
  const costSummary = container.costTracker.getSummary();
  logger.info(`\n========== Cost Summary ==========`);
  logger.info(`Total cost: $${costSummary.totalCost.toFixed(4)}`);
  logger.info(`Total tokens: ${costSummary.totalInputTokens} in / ${costSummary.totalOutputTokens} out`);

  if (result.selectedDesign) {
    logger.info(`Design: ${result.selectedDesign.chosen.name} (inspired by: ${result.selectedDesign.inspiration.title})`);
  }
  if (result.componentLibrary) {
    logger.info(`Component library: ${result.componentLibrary.components.length} components`);
  }
  if (result.buildValidation) {
    const bv = result.buildValidation;
    logger.info(`Build: ${bv.buildSuccess ? `SUCCESS` : `FAILED`} | Elements: ${bv.passedCount}/${bv.totalChecked}`);
  }

  const failedCount = [...result.taskResults.values()].filter((s) => s.status === `failed`).length;

  if (failedCount > 0) {
    const hardFailures = [...result.taskResults.values()].filter(
      (s) => s.status === `failed` && s.circuitBroken,
    );

    if (hardFailures.length > 0) {
      logger.error(`${hardFailures.length} tasks hit circuit breaker — exiting with code 2`);
      process.exit(2);
    }

    logger.warn(`${failedCount} tasks failed — exiting with code 1`);
    process.exit(1);
  }

  logger.info(`All tasks completed successfully. Files: ${result.files.length}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(`Fatal error:`, error);
  process.exit(1);
});
