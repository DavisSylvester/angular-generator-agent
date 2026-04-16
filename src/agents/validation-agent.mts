import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { BaseAgent } from './base-agent.mts';
import type { CodeFile } from '../types/index.mts';
import { loadPrompt } from '../prompts/load-prompt.mts';

export interface ValidationInput {
  readonly files: readonly CodeFile[];
  readonly prdContent: string;
  readonly taskName: string;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly suggestions: readonly string[];
}

const VALIDATION_SYSTEM_PROMPT = await loadPrompt("validation.md");

export class ValidationAgent extends BaseAgent<ValidationInput, ValidationResult> {

  protected async execute(input: ValidationInput, model: BaseChatModel): Promise<ValidationResult> {
    const fileBlocks = input.files
      .map((f) => {
        const lang = f.path.endsWith(`.html`) ? `html` : f.path.endsWith(`.scss`) ? `scss` : `typescript`;
        return `### ${f.path}\n\`\`\`${lang}\n${f.content}\n\`\`\``;
      })
      .join(`\n\n`);

    const messages = [
      new SystemMessage(VALIDATION_SYSTEM_PROMPT),
      new HumanMessage(
        `## Task: ${input.taskName}\n\n` +
        `## Generated Files\n\n${fileBlocks}\n\n` +
        `## PRD for Reference\n\n${input.prdContent}`,
      ),
    ];

    const response = await model.invoke(messages);
    const content = typeof response.content === `string`
      ? response.content
      : JSON.stringify(response.content);

    const jsonMatch = content.match(/```json\s*([\s\S]*?)```/) ?? content.match(/(\{[\s\S]*\})/);
    if (!jsonMatch?.[1]) {
      throw new Error(`Failed to extract validation result from LLM response`);
    }

    const parsed = JSON.parse(jsonMatch[1].trim()) as ValidationResult;

    return {
      valid: parsed.valid ?? false,
      errors: parsed.errors ?? [],
      warnings: parsed.warnings ?? [],
      suggestions: parsed.suggestions ?? [],
    };
  }
}
