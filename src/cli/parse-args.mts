export type CliCommand =
  | { kind: `run`; prdPath: string }
  | { kind: `resume`; runId: string }
  | { kind: `list-runs` }
  | { kind: `status`; runId: string }
  | { kind: `help` };

export type CliFramework = `angular` | `react` | `vue` | `svelte`;

export interface CliOptions {
  readonly command: CliCommand;
  readonly iterations: number | undefined;
  readonly maxTasks: number | undefined;
  readonly concurrency: number | undefined;
  readonly noValidate: boolean;
  readonly skipPlaywrightTest: boolean;
  readonly apiSpecPath: string | undefined;
  readonly framework: CliFramework;
}

function printHelp(): void {
  const help = `
spa-generator-agent — Generate SPA applications from PRDs

USAGE
  bun run src/index.mts --prd <file>              Start new SPA generation
  bun run src/index.mts --prd <file> --framework react   Use React instead of Angular
  bun run src/index.mts --resume <run-id>          Resume an interrupted run
  bun run src/index.mts --list-runs                List all previous runs
  bun run src/index.mts --status <run-id>          Show task status for a run

OPTIONS
  --prd <file>          Path to the PRD markdown file
  --api-spec <file>     Path to the API spec from api-generator-agent (OpenAPI JSON/YAML)
  --framework <fw>      SPA framework: angular, react, vue, svelte (default: angular)
  --resume <run-id>     Resume a previous run by ID
  --list-runs           List all previous runs and their status
  --status <run-id>     Show detailed task status for a run
  --iterations <n>      Max fix iterations per task (default: 5 or env)
  --max-tasks <n>       Limit to first N tasks
  --concurrency <n>     Parallel task limit (default: 4 or env)
  --no-validate         Skip LLM validation (lint still runs)
  --skip-playwright     Skip Playwright install/test during preflight
  --help                Show this help message

PIPELINE PHASES
  1. Design Search      Scrapes Dribbble for inspiration, LLM picks best match
  2. Design Creation    Google Stitch generates 6 designs (landing page first), user picks 1
  3. Save Decisions     Records selected design URL + color palette to .doc/
  4. Component Library   Extracts reusable components in the selected framework
  5. Code Generation     Builds the full SPA using API spec + component library
  6. Build Validation    Playwright verifies the built app renders correctly

ENVIRONMENT
  See .env.example for all configuration options.

EXAMPLES
  bun run src/index.mts --prd ./my-portal-prd.md --api-spec ./api-spec.json
  bun run src/index.mts --prd ./prd.md --iterations 10
  bun run src/index.mts --resume 01JARX9KP3M2VBCDE4567FG8H
`.trim();

  console.log(help);
}

export function parseArgs(argv: readonly string[]): CliOptions {
  const args = argv.slice(2);

  let command: CliCommand | undefined;
  let iterations: number | undefined;
  let maxTasks: number | undefined;
  let concurrency: number | undefined;
  let noValidate = false;
  let skipPlaywrightTest = false;
  let apiSpecPath: string | undefined;
  let framework: CliFramework = `angular`;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case `--help`:
      case `-h`:
        printHelp();
        command = { kind: `help` };
        break;

      case `--prd`: {
        const prdPath = args[++i];
        if (!prdPath) {
          console.error(`Error: --prd requires a file path`);
          process.exit(1);
        }
        command = { kind: `run`, prdPath };
        break;
      }

      case `--api-spec`: {
        const specPath = args[++i];
        if (!specPath) {
          console.error(`Error: --api-spec requires a file path`);
          process.exit(1);
        }
        apiSpecPath = specPath;
        break;
      }

      case `--resume`: {
        const runId = args[++i];
        if (!runId) {
          console.error(`Error: --resume requires a run ID`);
          process.exit(1);
        }
        command = { kind: `resume`, runId };
        break;
      }

      case `--list-runs`:
        command = { kind: `list-runs` };
        break;

      case `--status`: {
        const runId = args[++i];
        if (!runId) {
          console.error(`Error: --status requires a run ID`);
          process.exit(1);
        }
        command = { kind: `status`, runId };
        break;
      }

      case `--iterations`: {
        const val = args[++i];
        iterations = val ? parseInt(val, 10) : undefined;
        break;
      }

      case `--max-tasks`: {
        const val = args[++i];
        maxTasks = val ? parseInt(val, 10) : undefined;
        break;
      }

      case `--concurrency`: {
        const val = args[++i];
        concurrency = val ? parseInt(val, 10) : undefined;
        break;
      }

      case `--no-validate`:
        noValidate = true;
        break;

      case `--skip-playwright`:
        skipPlaywrightTest = true;
        break;

      case `--framework`: {
        const val = args[++i] as CliFramework | undefined;
        const valid: CliFramework[] = [`angular`, `react`, `vue`, `svelte`];
        if (!val || !valid.includes(val)) {
          console.error(`Error: --framework must be one of: ${valid.join(`, `)}`);
          process.exit(1);
        }
        framework = val;
        break;
      }

      default:
        // Legacy positional args: <prd-file> [max-iterations] [max-tasks]
        if (!command && arg && !arg.startsWith(`-`)) {
          command = { kind: `run`, prdPath: arg };
        } else if (command?.kind === `run` && !iterations && arg && !arg.startsWith(`-`)) {
          iterations = parseInt(arg, 10);
        } else if (command?.kind === `run` && !maxTasks && arg && !arg.startsWith(`-`)) {
          maxTasks = parseInt(arg, 10);
        }
        break;
    }
  }

  if (!command) {
    printHelp();
    command = { kind: `help` };
  }

  return {
    command,
    iterations,
    maxTasks,
    concurrency,
    noValidate,
    skipPlaywrightTest,
    apiSpecPath,
    framework,
  };
}
