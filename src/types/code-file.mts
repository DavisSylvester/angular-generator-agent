export interface CodeFile {
  readonly path: string;
  readonly content: string;
  readonly fileType: CodeFileType;
}

export type CodeFileType =
  | `component-ts`
  | `component-html`
  | `component-scss`
  | `component-spec`
  | `service`
  | `service-spec`
  | `model`
  | `interface`
  | `guard`
  | `interceptor`
  | `pipe`
  | `directive`
  | `route`
  | `module-config`
  | `environment`
  | `styles`
  | `config`
  | `other`;
