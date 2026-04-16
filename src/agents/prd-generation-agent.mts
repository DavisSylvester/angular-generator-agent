import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { BaseAgent } from './base-agent.mts';
import { PRD_GENERATION_SYSTEM_PROMPT } from '../prompts/prd-generation.mts';

export interface PrdGenerationInput {
  readonly rawText: string;
}

export interface PrdGenerationResult {
  readonly generatedMarkdown: string;
  readonly detectedTitle: string;
  readonly sectionCount: number;
}

export class PrdGenerationAgent extends BaseAgent<PrdGenerationInput, PrdGenerationResult> {

  protected async execute(
    input: PrdGenerationInput,
    model: BaseChatModel,
  ): Promise<PrdGenerationResult> {
    const messages = [
      new SystemMessage(PRD_GENERATION_SYSTEM_PROMPT),
      new HumanMessage(
        `Generate a complete PRD from the following raw description:\n\n` +
        `---\n\n${input.rawText}`,
      ),
    ];

    const response = await model.invoke(messages);
    const content = typeof response.content === `string`
      ? response.content
      : JSON.stringify(response.content);

    // Strip markdown code fences if the LLM wrapped the whole output
    const cleaned = content
      .replace(/^```(?:markdown|md)?\s*\n?/m, ``)
      .replace(/\n?```\s*$/m, ``)
      .trim();

    // Validate the generated PRD has headings
    const headingPattern = /^#{1,3}\s+(.+)/gm;
    const sections: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = headingPattern.exec(cleaned)) !== null) {
      if (match[1]) {
        sections.push(match[1].trim());
      }
    }

    if (sections.length < 3) {
      throw new Error(
        `Generated PRD has only ${sections.length} sections (minimum 3 required). ` +
        `LLM output may not be properly structured.`,
      );
    }

    const titleMatch = cleaned.match(/^#\s+(.+)/m);
    const detectedTitle = titleMatch?.[1]?.trim() ?? `Generated PRD`;

    // Track token usage from response metadata
    const meta = response.response_metadata as Record<string, Record<string, number>> | undefined;
    const usageMeta = (response as unknown as Record<string, Record<string, number>>).usage_metadata;
    const usage = meta?.usage ?? usageMeta;
    if (usage) {
      this.setTokenUsage({
        inputTokens: usage[`input_tokens`] ?? usage[`prompt_tokens`] ?? 0,
        outputTokens: usage[`output_tokens`] ?? usage[`completion_tokens`] ?? 0,
      });
    }

    return {
      generatedMarkdown: cleaned,
      detectedTitle,
      sectionCount: sections.length,
    };
  }
}
