# angular-generator-agent

Multi-agent pipeline that generates complete Angular applications from Product Requirements Documents (PRDs).

## What It Does

Given a markdown PRD, this agent:

1. **Plans** — Decomposes the PRD into an ordered task graph (models, services, components, routes, etc.)
2. **Generates** — LLM produces Angular code for each task (standalone components, SCSS, services)
3. **Validates** — Structural lint checks + LLM validation against the PRD
4. **Iterates** — Fix loop retries failed validations with error context fed back to the LLM
5. **Outputs** — Complete Angular project in `.workspace/<runId>/output/`

## Angular Standards

All generated code follows these conventions:

- Standalone components only (no NgModules)
- Separate `.ts`, `.html`, `.scss` files (no inline templates or styles)
- Angular Material for UI components
- SCSS with CSS variables for theming
- Flexbox for layout
- Strict TypeScript (no `any`)
- Signals for state, RxJS for HTTP streams
- `inject()` function, not constructor injection
- `OnPush` change detection

## Quick Start

```bash
# Install
bun install

# Configure
cp .env.example .env
# Edit .env with your LLM provider settings

# Run
./run.sh --prd examples/sample-dashboard-prd.md

# Or directly
bun run src/index.mts --prd path/to/prd.md
```

## Usage

```bash
# Start new generation
bun run src/index.mts --prd <file>

# Resume interrupted run
bun run src/index.mts --resume <run-id>

# List previous runs
bun run src/index.mts --list-runs

# Check run status
bun run src/index.mts --status <run-id>

# Options
--iterations <n>      Max fix iterations per task (default: 5)
--max-tasks <n>       Limit to first N tasks
--concurrency <n>     Parallel task limit (default: 4)
--no-validate         Skip LLM validation (lint still runs)
```

## LLM Providers

Supports three providers with automatic cross-provider fallback:

| Provider | Models | Cost |
|----------|--------|------|
| **Ollama** | qwen3.5:27b, qwen3-coder-next | Free (local) |
| **OpenAI** | gpt-4.1, gpt-4.1-mini | Pay-per-token |
| **Anthropic** | claude-sonnet-4-6, claude-haiku-4-5 | Pay-per-token |

## Architecture

```
src/
├── agents/          # LLM-powered agents (planning, codegen, validation)
├── cli/             # Command-line interface
├── config/          # Environment & model configuration
├── container/       # Dependency injection
├── graph/           # DAG parallel executor
├── input/           # PRD parsing
├── interfaces/      # Contracts (ILlmFactory, INotifier)
├── io/              # Workspace file management
├── llm/             # Provider factories & cost tracking
├── notifications/   # Console & Telegram channels
├── orchestrator/    # Pipeline & fix loop
├── prompts/         # LLM prompt templates
├── types/           # Result<T,E>, Task, CodeFile, etc.
└── verification/    # Structural lint validation
```

## Development

```bash
bun install              # Install dependencies
bunx tsc --noEmit        # Type check
bunx eslint src/         # Lint
bun test                 # Run tests
```

## License

MIT
