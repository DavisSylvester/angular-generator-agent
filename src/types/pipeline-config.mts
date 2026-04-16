export type SpaFramework = `angular` | `react` | `vue` | `svelte`;

export interface PipelineConfig {
  readonly maxFixIterations: number;
  readonly maxConcurrency: number;
  readonly maxTasks: number;
  readonly llmTimeoutMs: number;
  readonly workspaceDir: string;
  readonly taskCostLimit: number;
  readonly noValidate: boolean;
  readonly apiSpecPath: string | undefined;
  readonly googleApiKey: string | undefined;
  readonly stitchDesignCount: number;
  readonly dribbbleResultCount: number;
  readonly playwrightValidationElements: number;
  readonly skipPlaywrightTest: boolean;
  readonly framework: SpaFramework;
}
