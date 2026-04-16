import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { BaseAgent } from './base-agent.mts';
import type { DribbbleDesign } from '../types/index.mts';
import { DESIGN_SELECTION_SYSTEM_PROMPT } from '../prompts/design-selection.mts';

export interface DesignSelectionInput {
  readonly designs: readonly DribbbleDesign[];
  readonly prdContent: string;
  readonly projectTitle: string;
  readonly projectScope: string;
}

export interface DesignSelectionResult {
  readonly selectedIndex: number;
  readonly selectedTitle: string;
  readonly reasoning: string;
  readonly designNotes: {
    readonly colorPalette: string;
    readonly layoutPattern: string;
    readonly keyComponents: readonly string[];
  };
}

export class DesignSelectionAgent extends BaseAgent<DesignSelectionInput, DesignSelectionResult> {

  protected async execute(input: DesignSelectionInput, model: BaseChatModel): Promise<DesignSelectionResult> {
    const designList = input.designs
      .map((d, i) =>
        `### Design ${i}: ${d.title}\n` +
        `- **URL:** ${d.url}\n` +
        `- **Author:** ${d.author}\n` +
        `- **Tags:** ${d.tags.join(`, `)}\n` +
        `- **Description:** ${d.description}`,
      )
      .join(`\n\n`);

    const messages = [
      new SystemMessage(DESIGN_SELECTION_SYSTEM_PROMPT),
      new HumanMessage(
        `## Project\n\n` +
        `**Title:** ${input.projectTitle}\n` +
        `**Scope:** ${input.projectScope}\n\n` +
        `## PRD\n\n${input.prdContent}\n\n` +
        `## Candidate Designs (${input.designs.length} total)\n\n${designList}`,
      ),
    ];

    const response = await model.invoke(messages);
    const content = typeof response.content === `string`
      ? response.content
      : JSON.stringify(response.content);

    const jsonMatch = content.match(/```json\s*([\s\S]*?)```/) ?? content.match(/(\{[\s\S]*\})/);
    if (!jsonMatch?.[1]) {
      throw new Error(`Failed to extract design selection from LLM response`);
    }

    const parsed = JSON.parse(jsonMatch[1].trim()) as DesignSelectionResult;

    if (
      typeof parsed.selectedIndex !== `number` ||
      parsed.selectedIndex < 0 ||
      parsed.selectedIndex >= input.designs.length
    ) {
      throw new Error(`Invalid selectedIndex: ${String(parsed.selectedIndex)} (must be 0-${input.designs.length - 1})`);
    }

    return {
      selectedIndex: parsed.selectedIndex,
      selectedTitle: parsed.selectedTitle ?? input.designs[parsed.selectedIndex]?.title ?? ``,
      reasoning: parsed.reasoning ?? ``,
      designNotes: {
        colorPalette: parsed.designNotes?.colorPalette ?? ``,
        layoutPattern: parsed.designNotes?.layoutPattern ?? ``,
        keyComponents: parsed.designNotes?.keyComponents ?? [],
      },
    };
  }
}
