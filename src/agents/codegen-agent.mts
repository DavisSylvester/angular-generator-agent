import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { BaseAgent } from './base-agent.mts';
import type { CodeFile, CodeFileType, AngularTaskType } from '../types/index.mts';
import { CODEGEN_SYSTEM_PROMPT } from '../prompts/codegen.mts';

export interface CodegenInput {
  readonly taskName: string;
  readonly taskDescription: string;
  readonly taskType: AngularTaskType;
  readonly prdContent: string;
  readonly existingFiles: readonly CodeFile[];
  readonly mode: `generate` | `fix`;
  readonly errors?: readonly string[];
}

export class CodegenAgent extends BaseAgent<CodegenInput, CodeFile[]> {

  protected async execute(input: CodegenInput, model: BaseChatModel): Promise<CodeFile[]> {
    const userPrompt = this.buildUserPrompt(input);

    const messages = [
      new SystemMessage(CODEGEN_SYSTEM_PROMPT),
      new HumanMessage(userPrompt),
    ];

    const response = await model.invoke(messages);
    const content = typeof response.content === `string`
      ? response.content
      : JSON.stringify(response.content);

    return this.parseCodeResponse(content, input.taskType);
  }

  private buildUserPrompt(input: CodegenInput): string {
    const parts: string[] = [
      `## Task: ${input.taskName}`,
      `## Description: ${input.taskDescription}`,
      `## Task Type: ${input.taskType}`,
      ``,
      `## PRD Content`,
      input.prdContent,
    ];

    if (input.existingFiles.length > 0) {
      parts.push(``, `## Existing Files (for context and consistency)`);
      for (const file of input.existingFiles) {
        const lang = this.getLangFromPath(file.path);
        parts.push(`### ${file.path}`, `\`\`\`${lang}`, file.content, `\`\`\``);
      }
    }

    if (input.mode === `fix` && input.errors && input.errors.length > 0) {
      parts.push(``, `## Errors to Fix`, ...input.errors.map((e) => `- ${e}`));
    }

    return parts.join(`\n`);
  }

  private parseCodeResponse(content: string, taskType: AngularTaskType): CodeFile[] {
    const files: CodeFile[] = [];
    const blockPattern = /```(\w+)\s*\n([\s\S]*?)```/g;

    let match: RegExpExecArray | null;
    while ((match = blockPattern.exec(content)) !== null) {
      const lang = match[1] ?? ``;
      const body = (match[2] ?? ``).trim();

      if (![`typescript`, `ts`, `html`, `scss`, `css`, `json`].includes(lang)) {
        continue;
      }

      // Extract file path from comment on first line
      const pathMatch = body.match(/^(?:\/\/|<!--)\s*(src\/\S+?)(?:\s*-->)?\s*\n/);
      const path = pathMatch?.[1] ?? this.inferPath(body, lang, taskType);
      const bodyWithoutPath = pathMatch ? body.slice(pathMatch[0].length) : body;

      files.push({
        path,
        content: bodyWithoutPath.trim(),
        fileType: this.inferFileType(path),
      });
    }

    return files;
  }

  private inferPath(body: string, lang: string, taskType: AngularTaskType): string {
    const ext = lang === `typescript` || lang === `ts` ? `ts` : lang;
    return `src/app/${taskType}/generated.${ext}`;
  }

  private inferFileType(path: string): CodeFileType {
    if (path.endsWith(`.component.ts`)) return `component-ts`;
    if (path.endsWith(`.component.html`)) return `component-html`;
    if (path.endsWith(`.component.scss`)) return `component-scss`;
    if (path.endsWith(`.component.spec.ts`)) return `component-spec`;
    if (path.endsWith(`.service.ts`)) return `service`;
    if (path.endsWith(`.service.spec.ts`)) return `service-spec`;
    if (path.endsWith(`.model.ts`)) return `model`;
    if (path.endsWith(`.guard.ts`)) return `guard`;
    if (path.endsWith(`.interceptor.ts`)) return `interceptor`;
    if (path.endsWith(`.pipe.ts`)) return `pipe`;
    if (path.endsWith(`.directive.ts`)) return `directive`;
    if (path.endsWith(`.routes.ts`)) return `route`;
    if (path.endsWith(`environment.ts`)) return `environment`;
    if (path.endsWith(`.scss`)) return `styles`;
    if (path.endsWith(`.config.ts`)) return `config`;
    return `other`;
  }

  private getLangFromPath(path: string): string {
    if (path.endsWith(`.ts`)) return `typescript`;
    if (path.endsWith(`.html`)) return `html`;
    if (path.endsWith(`.scss`)) return `scss`;
    if (path.endsWith(`.json`)) return `json`;
    return `typescript`;
  }
}
