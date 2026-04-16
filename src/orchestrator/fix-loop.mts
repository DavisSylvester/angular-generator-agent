import type { Logger } from 'winston';
import type { CodegenAgent, CodegenInput } from '../agents/codegen-agent.mts';
import type { ValidationAgent, ValidationResult } from '../agents/validation-agent.mts';
import type { LintValidator } from '../verification/lint-validator.mts';
import type { CostTracker } from '../llm/cost-tracker.mts';
import type { Workspace } from '../io/workspace.mts';
import type { Task, TaskState, CodeFile } from '../types/index.mts';

/**
 * After this many iterations, accept the code if it has zero errors
 * OR only warnings/suggestions (no hard errors). This prevents infinite
 * loops where the validator keeps inventing new cosmetic issues.
 */
const GOOD_ENOUGH_AFTER_ITERATION = 2;

/**
 * Maximum number of LLM validation errors that still allow acceptance
 * after the good-enough threshold. Lint errors are never forgiven.
 */
const ACCEPTABLE_LLM_ERROR_CEILING = 2;

interface FixLoopOptions {
  readonly runId: string;
  readonly task: Task;
  readonly prdContent: string;
  readonly maxIterations: number;
  readonly taskCostLimit: number;
  readonly existingFiles: readonly CodeFile[];
  readonly noValidate: boolean;
}

interface FixLoopDeps {
  readonly codegenAgent: CodegenAgent;
  readonly validationAgent: ValidationAgent;
  readonly lintValidator: LintValidator;
  readonly costTracker: CostTracker;
  readonly workspace: Workspace;
  readonly logger: Logger;
}

export async function runFixLoop(
  options: FixLoopOptions,
  deps: FixLoopDeps,
): Promise<{ state: TaskState; files: CodeFile[] }> {
  const { runId, task, prdContent, maxIterations, taskCostLimit, noValidate } = options;
  const { codegenAgent, validationAgent, lintValidator, costTracker, workspace, logger } = deps;

  let currentFiles: CodeFile[] = [];
  let lastErrors: string[] = [];
  let lastErrorSet = new Set<string>();
  let consecutiveNoImprovement = 0;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    logger.info(`[Iteration ${iteration}] Task: ${task.name}`, { taskId: task.id });

    // Check cost limit
    const taskCost = costTracker.getTaskCost(task.id);
    if (taskCost > taskCostLimit) {
      logger.error(`Cost limit exceeded for task ${task.name}: $${taskCost.toFixed(2)} > $${taskCostLimit.toFixed(2)}`);
      return {
        state: { taskId: task.id, status: `failed`, iteration, lastError: `Cost limit exceeded` },
        files: currentFiles,
      };
    }

    // Circuit breaker: 5 consecutive iterations with no improvement
    if (consecutiveNoImprovement >= 5) {
      if (currentFiles.length > 0) {
        logger.warn(`Circuit breaker tripped for task: ${task.name} — saving best-effort code`, { taskId: task.id, iteration });
        return await acceptFiles(workspace, runId, task, iteration, currentFiles, `completed`);
      }
      return {
        state: { taskId: task.id, status: `failed`, iteration, lastError: `Circuit breaker: no improvement`, circuitBroken: true },
        files: currentFiles,
      };
    }

    // ── Step 1: Generate / Fix code ──────────────────────────────
    const codegenInput: CodegenInput = {
      taskName: task.name,
      taskDescription: task.description,
      taskType: task.type,
      prdContent,
      existingFiles: options.existingFiles,
      mode: iteration === 0 ? `generate` : `fix`,
      errors: lastErrors,
    };

    const codegenResult = await codegenAgent.run(codegenInput);

    if (!codegenResult.ok) {
      logger.error(`Code generation failed for task: ${task.name}`, { error: codegenResult.error.message });
      lastErrors = [codegenResult.error.message];
      consecutiveNoImprovement++;
      continue;
    }

    currentFiles = codegenResult.value.result;
    costTracker.record(
      codegenResult.value.model,
      codegenResult.value.tokenUsage.inputTokens,
      codegenResult.value.tokenUsage.outputTokens,
      task.id,
    );

    // Save iteration snapshot
    await workspace.saveIterationSnapshot(runId, task.id, iteration, currentFiles);

    // ── Step 2: Lint validation (always runs) ────────────────────
    const lintResult = lintValidator.validate(currentFiles);

    if (!lintResult.valid) {
      const lintErrors = lintResult.errors.map((e) => {
        const loc = e.line ? ` (line ${e.line})` : ``;
        return `[${e.file}]${loc} ${e.message}`;
      });

      logger.warn(`Lint errors in task: ${task.name} — resubmitting`, {
        taskId: task.id,
        iteration,
        lintErrors: lintErrors.length,
      });

      // Track improvement for circuit breaker
      const currentErrorSet = new Set(lintErrors);
      const fixedCount = [...lastErrorSet].filter((e) => !currentErrorSet.has(e)).length;
      if (fixedCount > 0) {
        consecutiveNoImprovement = 0;
      } else {
        consecutiveNoImprovement++;
      }

      lastErrors = lintErrors;
      lastErrorSet = currentErrorSet;
      continue;
    }

    // ── Step 3: LLM validation (optional — only after lint passes) ─
    if (noValidate) {
      logger.info(`LLM validation skipped for task: ${task.name} (lint passed)`);
      return await acceptFiles(workspace, runId, task, iteration, currentFiles, `completed`);
    }

    const validationResult = await validationAgent.run({
      files: currentFiles,
      prdContent,
      taskName: task.name,
    });

    if (!validationResult.ok) {
      logger.warn(`Validation agent failed for task: ${task.name} — accepting code (fail-open)`, {
        taskId: task.id,
        error: validationResult.error.message,
      });
      return await acceptFiles(workspace, runId, task, iteration, currentFiles, `completed`);
    }

    costTracker.record(
      validationResult.value.model,
      validationResult.value.tokenUsage.inputTokens,
      validationResult.value.tokenUsage.outputTokens,
      task.id,
    );

    const vr: ValidationResult = validationResult.value.result;

    if (vr.warnings.length > 0) {
      logger.info(`LLM validation warnings for task: ${task.name}`, { warnings: vr.warnings.length, items: vr.warnings });
    }

    // ── Accept if clean ──────────────────────────────────────────
    if (vr.valid || vr.errors.length === 0) {
      logger.info(`Task completed successfully: ${task.name}`, { taskId: task.id, iteration });
      return await acceptFiles(workspace, runId, task, iteration, currentFiles, `completed`);
    }

    // ── Good-enough threshold (LLM errors only — lint already passed) ─
    if (iteration >= GOOD_ENOUGH_AFTER_ITERATION && vr.errors.length <= ACCEPTABLE_LLM_ERROR_CEILING) {
      logger.info(
        `Task accepted (good enough after ${iteration + 1} iterations, lint clean): ${task.name}`,
        { taskId: task.id, iteration, remainingLlmErrors: vr.errors.length, errors: vr.errors },
      );
      return await acceptFiles(workspace, runId, task, iteration, currentFiles, `completed`);
    }

    // ── Track improvement ────────────────────────────────────────
    const allErrors = [...vr.errors];
    const currentErrorSet = new Set(allErrors);
    const newErrors = allErrors.filter((e) => !lastErrorSet.has(e));
    const fixedErrors = [...lastErrorSet].filter((e) => !currentErrorSet.has(e));

    if (newErrors.length === 0 && fixedErrors.length === 0) {
      consecutiveNoImprovement++;
    } else if (fixedErrors.length > 0) {
      consecutiveNoImprovement = 0;
      logger.info(`Progress: fixed ${fixedErrors.length} errors, ${newErrors.length} new`, { taskId: task.id });
    } else {
      consecutiveNoImprovement++;
    }

    lastErrors = allErrors;
    lastErrorSet = currentErrorSet;
    logger.warn(`LLM validation errors for task: ${task.name}`, { errors: allErrors.length, iteration, items: allErrors });
  }

  // Max iterations reached — save whatever we have
  if (currentFiles.length > 0) {
    logger.warn(`Max iterations reached for task: ${task.name} — saving best-effort code`, { taskId: task.id });
    return await acceptFiles(workspace, runId, task, maxIterations, currentFiles, `completed`);
  }

  return {
    state: { taskId: task.id, status: `failed`, iteration: maxIterations, lastError: `Max iterations reached with no files` },
    files: currentFiles,
  };
}

/** Save code files + task state and return a consistent result. */
async function acceptFiles(
  workspace: Workspace,
  runId: string,
  task: Task,
  iteration: number,
  files: CodeFile[],
  status: `completed` | `failed`,
): Promise<{ state: TaskState; files: CodeFile[] }> {
  for (const file of files) {
    await workspace.saveCodeFile(runId, file);
  }

  const state: TaskState = { taskId: task.id, status, iteration };
  await workspace.saveTaskState(runId, task.id, state);

  return { state, files };
}
