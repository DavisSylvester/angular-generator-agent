export type AngularTaskType =
  | `scaffold`
  | `model`
  | `service`
  | `component`
  | `layout`
  | `routing`
  | `guard`
  | `interceptor`
  | `pipe`
  | `directive`
  | `feature-module`
  | `styles`
  | `config`;

export type TaskStatus =
  | `pending`
  | `running`
  | `completed`
  | `failed`
  | `skipped`;

export interface Task {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly dependsOn: readonly string[];
  readonly type: AngularTaskType;
  readonly metadata: Record<string, unknown>;
}

export interface TaskGraph {
  readonly runId: string;
  readonly prdHash: string;
  readonly tasks: readonly Task[];
}

export interface TaskState {
  readonly taskId: string;
  readonly status: TaskStatus;
  readonly iteration: number;
  readonly lastError?: string;
  readonly circuitBroken?: boolean;
}
