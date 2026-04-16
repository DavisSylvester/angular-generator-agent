import { createLogger, format, transports } from 'winston';
import type { Logger } from 'winston';
import type { EnvConfig } from '../config/env.mts';
import type { PipelineConfig } from '../types/index.mts';
import type { ILlmFactory } from '../interfaces/i-llm-factory.mts';
import type { INotifier } from '../interfaces/i-notifier.mts';
import { OllamaFactory } from '../llm/ollama-factory.mts';
import { OpenAIFactory } from '../llm/openai-factory.mts';
import { AnthropicFactory } from '../llm/anthropic-factory.mts';
import { CostTracker } from '../llm/cost-tracker.mts';
import { VisualFidelityAgent } from '../agents/visual-fidelity-agent.mts';
import { PlanningAgent } from '../agents/planning-agent.mts';
import { CodegenAgent } from '../agents/codegen-agent.mts';
import { ValidationAgent } from '../agents/validation-agent.mts';
import { DesignSelectionAgent } from '../agents/design-selection-agent.mts';
import { ComponentLibraryAgent } from '../agents/component-library-agent.mts';
import { PrdGenerationAgent } from '../agents/prd-generation-agent.mts';
import { Workspace } from '../io/workspace.mts';
import { ParallelExecutor } from '../graph/parallel-executor.mts';
import { ConsoleChannel } from '../notifications/console-channel.mts';
import { TelegramChannel } from '../notifications/telegram-channel.mts';
import { Notifier } from '../notifications/notifier.mts';
import { LintValidator } from '../verification/lint-validator.mts';
import { DribbbleScraper } from '../services/dribbble-scraper.mts';
import { DribbbleApiClient } from '../services/dribbble-api-client.mts';
import { StitchService } from '../services/stitch-service.mts';
import { PROVIDER_MODEL_MAP, getFallbackTiers } from '../config/models.mts';
import type { LlmProvider, AgentRole } from '../config/models.mts';

export interface Container {
  readonly logger: Logger;
  readonly primaryFactory: ILlmFactory;
  readonly prdGenerationAgent: PrdGenerationAgent;
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
  readonly pipelineConfig: PipelineConfig;
}

// Redact secrets from log output
const SECRET_PATTERNS = [/sk-[a-zA-Z0-9]+/g, /sk-ant-[a-zA-Z0-9]+/g, /key-[a-zA-Z0-9]+/g];

function redactSecrets(message: string): string {
  let redacted = message;
  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, `[REDACTED]`);
  }
  return redacted;
}

export function createContainer(env: EnvConfig, overrides?: Partial<PipelineConfig>): Container {
  // ── Logger ──────────────────────────────────────────────────────
  const logger = createLogger({
    level: `info`,
    format: format.combine(
      format.timestamp(),
      format.printf(({ level, message, timestamp, ...meta }) => {
        const msg = redactSecrets(String(message));
        const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : ``;
        return `${String(timestamp)} [${level.toUpperCase()}] ${msg}${metaStr}`;
      }),
    ),
    transports: [
      new transports.Console({
        format: format.combine(
          format.colorize(),
          format.printf(({ level, message, timestamp }) => {
            const msg = redactSecrets(String(message));
            return `${String(timestamp)} ${level}: ${msg}`;
          }),
        ),
      }),
    ],
  });

  // ── LLM Factories ─────────────────────────────────────────────
  const factories = new Map<LlmProvider, ILlmFactory>();
  const provider: LlmProvider = env.LLM_PROVIDER as LlmProvider;

  switch (provider) {
    case `ollama`:
      factories.set(`ollama`, new OllamaFactory(env.OLLAMA_HOST, env.OLLAMA_API_KEY, env.LLM_TIMEOUT_MS));
      break;
    case `openai`:
      factories.set(`openai`, new OpenAIFactory(env.OPENAI_API_KEY ?? ``, env.LLM_TIMEOUT_MS));
      break;
    case `anthropic`:
      factories.set(`anthropic`, new AnthropicFactory(env.ANTHROPIC_API_KEY ?? ``, env.LLM_TIMEOUT_MS));
      break;
  }

  // Fallback factories
  if (provider !== `openai` && env.OPENAI_API_KEY) {
    factories.set(`openai`, new OpenAIFactory(env.OPENAI_API_KEY, env.LLM_TIMEOUT_MS));
    logger.info(`Fallback factory registered: openai`);
  }
  if (provider !== `anthropic` && env.ANTHROPIC_API_KEY) {
    factories.set(`anthropic`, new AnthropicFactory(env.ANTHROPIC_API_KEY, env.LLM_TIMEOUT_MS));
    logger.info(`Fallback factory registered: anthropic`);
  }
  if (provider !== `ollama` && env.OLLAMA_HOST) {
    factories.set(`ollama`, new OllamaFactory(env.OLLAMA_HOST, env.OLLAMA_API_KEY, env.LLM_TIMEOUT_MS));
    logger.info(`Fallback factory registered: ollama`);
  }

  const primaryFactory = factories.get(provider);
  if (!primaryFactory) {
    throw new Error(`No factory registered for provider: ${provider}`);
  }

  const models = PROVIDER_MODEL_MAP[provider];

  // ── Model Chain Builder ────────────────────────────────────────
  const buildChain = (role: AgentRole): { model: ReturnType<ILlmFactory[`create`]>; name: string }[] => {
    const primaryConfig = models[role];
    const chain: { model: ReturnType<ILlmFactory[`create`]>; name: string }[] = [
      { model: primaryFactory.create(primaryConfig.model, primaryConfig.temperature), name: `${provider}/${primaryConfig.model}` },
    ];

    const fallbackTiers = getFallbackTiers(provider);
    for (const tier of fallbackTiers) {
      const fallbackFactory = factories.get(tier.provider);
      if (fallbackFactory) {
        chain.push({
          model: fallbackFactory.create(tier.model, tier.temperature),
          name: `${tier.provider}/${tier.model}`,
        });
      }
    }

    logger.debug(`Model chain for ${role}`, { models: chain.map((c) => c.name) });
    return chain;
  };

  // ── Agents ─────────────────────────────────────────────────────
  const prdGenerationAgent = new PrdGenerationAgent(logger, buildChain(`planning`), env.LLM_TIMEOUT_MS);
  const planningAgent = new PlanningAgent(logger, buildChain(`planning`), env.LLM_TIMEOUT_MS);
  const codegenAgent = new CodegenAgent(logger, buildChain(`codegen`), env.LLM_TIMEOUT_MS);
  const validationAgent = new ValidationAgent(logger, buildChain(`validation`), env.LLM_TIMEOUT_MS);
  const designSelectionAgent = new DesignSelectionAgent(logger, buildChain(`planning`), env.LLM_TIMEOUT_MS);
  const componentLibraryAgent = new ComponentLibraryAgent(logger, buildChain(`codegen`), env.LLM_TIMEOUT_MS);
  const visualFidelityAgent = new VisualFidelityAgent(logger, buildChain(`validation`), env.LLM_TIMEOUT_MS);

  // ── Infrastructure ─────────────────────────────────────────────
  const costTracker = new CostTracker(logger);
  const workspace = new Workspace(env.WORKSPACE_DIR, logger);
  const executor = new ParallelExecutor(logger);
  const lintValidator = new LintValidator(logger);

  // ── Services ───────────────────────────────────────────────────
  const dribbbleScraper = new DribbbleScraper(logger, env.DRIBBBLE_RESULT_COUNT);
  const dribbbleApiClient = env.DRIBBBLE_ACCESS_TOKEN
    ? new DribbbleApiClient(logger, env.DRIBBBLE_ACCESS_TOKEN, env.DRIBBBLE_RESULT_COUNT)
    : undefined;
  const googleApiKey = env.GOOGLE_API_KEY ?? env.STITCH_API_KEY ?? ``;
  const stitchService = new StitchService(logger, googleApiKey, env.STITCH_DESIGN_COUNT);

  // ── Notifications ──────────────────────────────────────────────
  const channels = [new ConsoleChannel(logger)];
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    channels.push(new TelegramChannel(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID, logger) as never);
  }
  const notifier = new Notifier(channels);

  // ── Pipeline Config ────────────────────────────────────────────
  const pipelineConfig: PipelineConfig = {
    maxFixIterations: overrides?.maxFixIterations ?? env.MAX_FIX_ITERATIONS,
    maxConcurrency: overrides?.maxConcurrency ?? env.MAX_CONCURRENCY,
    maxTasks: overrides?.maxTasks ?? 0,
    llmTimeoutMs: env.LLM_TIMEOUT_MS,
    workspaceDir: env.WORKSPACE_DIR,
    taskCostLimit: env.TASK_COST_LIMIT,
    noValidate: overrides?.noValidate ?? false,
    apiSpecPath: overrides?.apiSpecPath ?? undefined,
    googleApiKey: env.GOOGLE_API_KEY ?? env.STITCH_API_KEY,
    stitchDesignCount: env.STITCH_DESIGN_COUNT,
    dribbbleResultCount: env.DRIBBBLE_RESULT_COUNT,
    playwrightValidationElements: env.PLAYWRIGHT_VALIDATION_ELEMENTS,
    skipPlaywrightTest: overrides?.skipPlaywrightTest ?? false,
    framework: overrides?.framework ?? `angular`,
  };

  return {
    logger,
    primaryFactory,
    prdGenerationAgent,
    planningAgent,
    codegenAgent,
    validationAgent,
    designSelectionAgent,
    componentLibraryAgent,
    visualFidelityAgent,
    lintValidator,
    costTracker,
    workspace,
    executor,
    notifier,
    dribbbleScraper,
    dribbbleApiClient,
    stitchService,
    pipelineConfig,
  };
}
