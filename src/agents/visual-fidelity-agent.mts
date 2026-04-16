import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { BaseAgent } from './base-agent.mts';
import { loadPrompt } from '../prompts/load-prompt.mts';

export interface FidelityCheckInput {
  readonly pageName: string;
  readonly pageRoute: string;
  readonly stitchDesignUrl: string;
  readonly stitchDesignDescription: string;
  readonly appScreenshotBase64: string;
  readonly stitchScreenshotBase64: string;
  readonly designTokensSCSS: string;
  readonly colorPalette: {
    readonly primary: string;
    readonly accent: string;
    readonly background: string;
    readonly surface: string;
    readonly text: string;
  };
}

export interface FidelityCheckResult {
  readonly pageName: string;
  readonly overallScore: number;
  readonly matches: boolean;
  readonly colorSchemeScore: number;
  readonly layoutScore: number;
  readonly componentScore: number;
  readonly typographyScore: number;
  readonly issues: readonly FidelityIssue[];
  readonly fixInstructions: string;
}

export interface FidelityIssue {
  readonly severity: `critical` | `major` | `minor`;
  readonly category: `color` | `layout` | `component` | `typography` | `spacing`;
  readonly description: string;
  readonly expected: string;
  readonly actual: string;
  readonly fix: string;
}

const FIDELITY_SYSTEM_PROMPT = await loadPrompt("visual-fidelity.md");

export class VisualFidelityAgent extends BaseAgent<FidelityCheckInput, FidelityCheckResult> {

  protected async execute(input: FidelityCheckInput, model: BaseChatModel): Promise<FidelityCheckResult> {
    const messages = [
      new SystemMessage(FIDELITY_SYSTEM_PROMPT),
      new HumanMessage({
        content: [
          {
            type: `text` as const,
            text: [
              `## Page: ${input.pageName} (${input.pageRoute})`,
              `## Stitch Design: ${input.stitchDesignUrl}`,
              `## Stitch Description: ${input.stitchDesignDescription}`,
              ``,
              `## Design Color Palette`,
              `- Primary: ${input.colorPalette.primary}`,
              `- Accent: ${input.colorPalette.accent}`,
              `- Background: ${input.colorPalette.background}`,
              `- Surface: ${input.colorPalette.surface}`,
              `- Text: ${input.colorPalette.text}`,
              ``,
              `## Design Tokens (SCSS)`,
              `\`\`\`scss`,
              input.designTokensSCSS.slice(0, 2000),
              `\`\`\``,
              ``,
              `Compare the Stitch design screenshot against the built app screenshot below.`,
              `Score each dimension 1-10 and list any issues.`,
            ].join(`\n`),
          },
          ...(input.stitchScreenshotBase64 ? [{
            type: `image_url` as const,
            image_url: { url: `data:image/png;base64,${input.stitchScreenshotBase64}` },
          }] : []),
          ...(input.appScreenshotBase64 ? [{
            type: `image_url` as const,
            image_url: { url: `data:image/png;base64,${input.appScreenshotBase64}` },
          }] : []),
        ],
      }),
    ];

    const response = await model.invoke(messages);
    const content = typeof response.content === `string`
      ? response.content
      : JSON.stringify(response.content);

    const jsonMatch = content.match(/```json\s*([\s\S]*?)```/) ?? content.match(/(\{[\s\S]*\})/);
    if (!jsonMatch?.[1]) {
      throw new Error(`Failed to parse fidelity check result from LLM response`);
    }

    const parsed = JSON.parse(jsonMatch[1].trim()) as FidelityCheckResult;

    return {
      pageName: parsed.pageName ?? input.pageName,
      overallScore: parsed.overallScore ?? 0,
      matches: parsed.overallScore >= 7,
      colorSchemeScore: parsed.colorSchemeScore ?? 0,
      layoutScore: parsed.layoutScore ?? 0,
      componentScore: parsed.componentScore ?? 0,
      typographyScore: parsed.typographyScore ?? 0,
      issues: parsed.issues ?? [],
      fixInstructions: parsed.fixInstructions ?? ``,
    };
  }
}
