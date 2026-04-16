import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { BaseAgent } from './base-agent.mts';

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

const FIDELITY_SYSTEM_PROMPT = `You are a visual fidelity reviewer for web applications. You compare a built Angular app page against its Google Stitch design to verify they match.

## Your Job

Given:
1. A screenshot of the Stitch design (the target)
2. A screenshot of the built Angular app (the actual)
3. The design token SCSS (colors, fonts, spacing)
4. The color palette

Evaluate how closely the built app matches the Stitch design on these dimensions:

### Scoring (1-10 for each)

- **colorSchemeScore**: Do the primary, accent, and background colors match the design tokens?
- **layoutScore**: Does the page layout match? (sidebar position, card grid, content sections)
- **componentScore**: Are the expected UI components present? (metric cards, data tables, nav sidebar, tabs, etc.)
- **typographyScore**: Do headings and body text use the expected fonts and sizes?

### overallScore

Average of the 4 scores. If < 7, the page does NOT match and needs regeneration.

### Issues

For each mismatch, describe:
- severity: critical (page looks completely different), major (key elements missing/wrong), minor (small differences)
- category: color, layout, component, typography, spacing
- description: what's wrong
- expected: what it should look like (from Stitch)
- actual: what it currently looks like
- fix: specific Angular code change needed

### Fix Instructions

If overallScore < 7, write a concise prompt that could be fed back to the codegen agent to fix the page. Include:
- Specific hex colors to use
- Layout structure changes needed
- Components to add/modify
- SCSS changes

## Response Format

\`\`\`json
{
  "pageName": "Dashboard",
  "overallScore": 8,
  "matches": true,
  "colorSchemeScore": 9,
  "layoutScore": 7,
  "componentScore": 8,
  "typographyScore": 7,
  "issues": [...],
  "fixInstructions": ""
}
\`\`\``;

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
