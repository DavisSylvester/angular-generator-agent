import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { Logger } from 'winston';
import type { Result, StitchDesign, StyleGuide, StyleGuideElement, StyleGuideColor, TypographySpec, SpacingSpec } from '../types/index.mts';
import { ok, err } from '../types/index.mts';
import type { Workspace } from '../io/workspace.mts';
import type { CostTracker } from '../llm/cost-tracker.mts';

// ── Playwright callbacks ────────────────────────────────────────────

export interface StyleGuidePlaywrightCallbacks {
  navigate(url: string): Promise<void>;
  screenshot(): Promise<string>;
}

// ── Element table used in the system prompt ─────────────────────────

const ELEMENT_TABLE = `
| Element | Properties to Extract |
|---|---|
| Side Navigation | Width, bg color, item height, icon size, text size, active state, hover, padding, dividers |
| Header Bar | Height, bg, shadow, breadcrumb style, user avatar position |
| Buttons (primary, secondary, outline) | Height, padding, border-radius, font-size, font-weight, colors for each variant |
| Cards (metric, content) | Border-radius, shadow, padding, border-top accent width/color |
| Data Tables | Header bg, header font, row height, row hover, alternating colors, cell padding |
| Status Badges | Border-radius, padding, font-size, weight, color map per status |
| Form Fields | Input height, border-radius, label style, error style |
| Typography | h1/h2/h3/body/caption — font-family, size, weight, color, line-height |
| Spacing | Grid gap, section padding, card margin |
| Color Palette | All hex values with usage context |
`.trim();

// ── System prompt ───────────────────────────────────────────────────

const SYSTEM_PROMPT =
  `You are a UI design analyst. Given a screenshot of a web application design, ` +
  `decompose it into its atomic visual elements using a box model breakdown.\n\n` +
  `Extract the following element categories and their properties:\n\n` +
  `${ELEMENT_TABLE}\n\n` +
  `Respond with ONLY valid JSON matching this schema:\n` +
  '```json\n' +
  `{
  "elements": [
    { "element": "Side Navigation", "properties": { "width": "260px", "bgColor": "#0A192F", ... } }
  ],
  "typography": [
    { "level": "h1", "fontFamily": "Lexend", "fontSize": "28px", "fontWeight": "700", "color": "#1A1A2E", "lineHeight": "1.3" }
  ],
  "spacing": {
    "gridGap": "24px",
    "sectionPadding": "32px",
    "cardMargin": "16px"
  },
  "colorPalette": [
    { "hex": "#0052CC", "usage": "Primary accent, buttons, active nav item" }
  ]
}\n` +
  '```\n\n' +
  `Be precise with pixel values, hex colors, and font specifications. ` +
  `If a property is not visible, use your best estimate based on the design's visual language. ` +
  `Extract ALL elements visible in the screenshot, not just those in the table above.`;

// ── Main extraction function ────────────────────────────────────────

/**
 * Takes screenshots of the chosen Stitch design, sends them to Gemini
 * for box model decomposition, and returns a structured StyleGuide.
 *
 * The style guide is also saved as `.doc/style-guide.md` in the workspace
 * output directory.
 */
export async function extractStyleGuide(
  chosenDesign: StitchDesign,
  apiKey: string,
  runId: string,
  logger: Logger,
  workspace: Workspace,
  costTracker: CostTracker,
  pw: StyleGuidePlaywrightCallbacks,
): Promise<Result<StyleGuide, Error>> {

  logger.info(`Navigating to chosen Stitch design: ${chosenDesign.previewUrl}`);

  // Navigate to the design and capture screenshots
  await pw.navigate(chosenDesign.previewUrl);
  // Allow the design to fully render
  await new Promise((r) => setTimeout(r, 5000));

  const screenshotBase64 = await pw.screenshot();

  if (!screenshotBase64) {
    return err(new Error(`Failed to capture screenshot of Stitch design`));
  }

  logger.info(`Screenshot captured, sending to Gemini for box model decomposition...`);

  // Use Gemini with vision to analyze the screenshot
  const gemini = new ChatGoogleGenerativeAI({
    model: `gemini-2.5-flash`,
    temperature: 0.2,
    apiKey,
  });

  const response = await gemini.invoke([
    new SystemMessage(SYSTEM_PROMPT),
    new HumanMessage({
      content: [
        {
          type: `image_url` as const,
          image_url: `data:image/png;base64,${screenshotBase64}`,
        },
        {
          type: `text` as const,
          text: `Analyze this design screenshot for "${chosenDesign.name}" and extract a complete box model decomposition. `
            + `Include every visible UI element, color, typography level, and spacing value.`,
        },
      ],
    }),
  ]);

  const content = typeof response.content === `string`
    ? response.content
    : JSON.stringify(response.content);

  // Track Gemini cost
  costTracker.record(
    `gemini-2.5-flash`,
    content.length * 4, // rough input token estimate
    content.length,
    `style-guide-extraction`,
  );

  // Parse the JSON response
  const jsonMatch = content.match(/```json\s*([\s\S]*?)```/) ?? content.match(/(\{[\s\S]*\})/);
  if (!jsonMatch?.[1]) {
    logger.warn(`Failed to parse Gemini style guide response`);
    return err(new Error(`Gemini did not return valid JSON for style guide extraction`));
  }

  let parsed: RawStyleGuideResponse;
  try {
    parsed = JSON.parse(jsonMatch[1].trim()) as RawStyleGuideResponse;
  } catch {
    return err(new Error(`Failed to parse style guide JSON from Gemini`));
  }

  // Build the structured StyleGuide
  const elements: StyleGuideElement[] = (parsed.elements ?? []).map((e) => ({
    element: e.element ?? `Unknown`,
    properties: e.properties ?? {},
  }));

  const typography: TypographySpec[] = (parsed.typography ?? []).map((t) => ({
    level: t.level ?? `body`,
    fontFamily: t.fontFamily ?? `Inter`,
    fontSize: t.fontSize ?? `16px`,
    fontWeight: t.fontWeight ?? `400`,
    color: t.color ?? `#333333`,
    lineHeight: t.lineHeight ?? `1.5`,
  }));

  const spacing: SpacingSpec = {
    gridGap: parsed.spacing?.gridGap ?? `24px`,
    sectionPadding: parsed.spacing?.sectionPadding ?? `32px`,
    cardMargin: parsed.spacing?.cardMargin ?? `16px`,
  };

  const colorPalette: StyleGuideColor[] = (parsed.colorPalette ?? []).map((c) => ({
    hex: c.hex ?? `#000000`,
    usage: c.usage ?? `Unknown`,
  }));

  // Generate the markdown representation
  const rawMarkdown = buildStyleGuideMarkdown(chosenDesign.name, elements, typography, spacing, colorPalette);

  const styleGuide: StyleGuide = {
    elements,
    typography,
    spacing,
    colorPalette,
    rawMarkdown,
  };

  // Save the style guide to the workspace
  await workspace.saveCodeFile(runId, {
    path: `.doc/style-guide.md`,
    content: rawMarkdown,
    fileType: `other`,
  });

  logger.info(`Style guide extracted`, {
    elements: elements.length,
    typographyLevels: typography.length,
    colors: colorPalette.length,
  });

  return ok(styleGuide);
}

// ── Helpers ─────────────────────────────────────────────────────────

interface RawStyleGuideResponse {
  readonly elements?: readonly { element?: string; properties?: Record<string, string> }[];
  readonly typography?: readonly {
    level?: string; fontFamily?: string; fontSize?: string;
    fontWeight?: string; color?: string; lineHeight?: string;
  }[];
  readonly spacing?: { gridGap?: string; sectionPadding?: string; cardMargin?: string };
  readonly colorPalette?: readonly { hex?: string; usage?: string }[];
}

function buildStyleGuideMarkdown(
  designName: string,
  elements: readonly StyleGuideElement[],
  typography: readonly TypographySpec[],
  spacing: SpacingSpec,
  colorPalette: readonly StyleGuideColor[],
): string {
  const lines: string[] = [
    `# Style Guide — ${designName}`,
    ``,
    `> Auto-extracted via box model decomposition. This is the single source of truth for all component generation.`,
    ``,
    `## Color Palette`,
    ``,
    `| Hex | Usage |`,
    `|-----|-------|`,
    ...colorPalette.map((c) => `| \`${c.hex}\` | ${c.usage} |`),
    ``,
    `## Typography`,
    ``,
    `| Level | Font Family | Size | Weight | Color | Line Height |`,
    `|-------|-------------|------|--------|-------|-------------|`,
    ...typography.map((t) =>
      `| ${t.level} | ${t.fontFamily} | ${t.fontSize} | ${t.fontWeight} | \`${t.color}\` | ${t.lineHeight} |`,
    ),
    ``,
    `## Spacing`,
    ``,
    `| Token | Value |`,
    `|-------|-------|`,
    `| Grid gap | ${spacing.gridGap} |`,
    `| Section padding | ${spacing.sectionPadding} |`,
    `| Card margin | ${spacing.cardMargin} |`,
    ``,
    `## UI Elements`,
    ``,
  ];

  for (const el of elements) {
    lines.push(`### ${el.element}`);
    lines.push(``);
    lines.push(`| Property | Value |`);
    lines.push(`|----------|-------|`);
    for (const [key, value] of Object.entries(el.properties)) {
      lines.push(`| ${key} | ${value} |`);
    }
    lines.push(``);
  }

  return lines.join(`\n`);
}
