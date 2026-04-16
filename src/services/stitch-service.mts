import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { Logger } from 'winston';
import type { Result, StitchDesign, DribbbleDesign } from '../types/index.mts';
import { ok, err } from '../types/index.mts';
import { ulid } from 'ulid';
import { retryWithBackoff } from '../utils/retry-with-backoff.mts';

/**
 * Playwright callbacks the caller wires up to MCP tools.
 */
export interface StitchPlaywrightCallbacks {
  navigate(url: string): Promise<void>;
  snapshot(): Promise<string>;
  screenshot(): Promise<string>;
  fill(ref: string, value: string): Promise<void>;
  click(ref: string): Promise<void>;
  fillSelector(selector: string, value: string): Promise<void>;
  clickSelector(selector: string): Promise<void>;
  getCurrentUrl(): Promise<string>;
  waitFor(ms: number): Promise<void>;
}

/**
 * The 5 design directions used for every run.
 *
 * Each design varies in color scheme, approach, and design pattern.
 * Variation 4 is ALWAYS the AI-Embedded Command Palette design.
 * Every design includes a landing page as the first screen.
 */
const DESIGN_DIRECTIONS: readonly DesignDirection[] = [
  {
    name: `Clean Minimal`,
    style: `Clean minimal design with generous whitespace and a light color scheme. `
      + `Light grey (#F9FAFB) background, white cards with subtle drop shadows, dark navy (#0A192F) sidebar. `
      + `Lexend headings, Inter body text. Flat metric cards, clean data tables with thin borders. `
      + `Rounded corners, soft blue (#0052CC) primary accents. Calm and professional.`,
    approach: `Simplicity-first — prioritizes scannability and breathing room`,
    pattern: `sidebar-nav with card grid`,
  },
  {
    name: `Bold Athletic`,
    style: `Bold energetic design with a dark theme and vibrant orange (#FF6B35) accents. `
      + `Near-black (#0F172A) background, charcoal (#1E293B) cards with strong shadows and gradient section headers. `
      + `Orange buttons, highlight badges, and chart lines. Large bold metric numbers. `
      + `Sport-inspired typography with condensed headings. High-energy feel.`,
    approach: `Impact-first — grabs attention, celebrates achievement`,
    pattern: `full-width dashboard with collapsible sidebar`,
  },
  {
    name: `Data-Dense Pro`,
    style: `Professional data-dense design in high-contrast dark mode. `
      + `True black (#09090B) background with bright white text, electric blue (#3B82F6) glow on key elements. `
      + `Compact spacing, small but readable fonts, information-rich panels. `
      + `Split-pane layouts, sparkline mini-charts in table cells. Borderless cards with subtle gradients.`,
    approach: `Density-first — maximum information per viewport, zero wasted space`,
    pattern: `multi-panel dashboard with fixed header`,
  },
  {
    name: `AI Command Palette`,
    style: `AI-Embedded Command Palette design inspired by Raycast/Linear/Spotlight. `
      + `Features a prominent ⌘K command palette overlay that is the primary way users navigate and act. `
      + `The palette supports natural-language queries ("show John's bench press history", "log workout for Maria"). `
      + `Minimal chrome — the command palette replaces traditional menus and navigation. `
      + `Dark muted background (#18181B), soft white cards, violet (#7C3AED) accent for AI interactions. `
      + `Monospace font for the command input, contextual result panels that preview data inline.`,
    approach: `AI-first — command palette is the primary interaction model, sidebar is secondary`,
    pattern: `command-palette-centric with minimal sidebar and contextual panels`,
  },
  {
    name: `Warm Earth Tones`,
    style: `Warm approachable design with earth-tone palette. `
      + `Soft cream (#FFFBEB) background, warm brown (#78350F) sidebar, terracotta (#C2410C) accents. `
      + `Rounded cards with warm shadows, friendly sans-serif typography (Nunito or Poppins). `
      + `Organic shapes, subtle texture overlays, muted status colors (olive green, burnt orange, dusty rose). `
      + `Feels welcoming — designed so young athletes aren't intimidated by the interface.`,
    approach: `Warmth-first — approachable and friendly for high school athletes`,
    pattern: `top-nav with hero dashboard and card-based content sections`,
  },
  {
    name: `Minimalist White`,
    style: `Ultra-minimalist all-white design with maximum negative space. `
      + `Pure white (#FFFFFF) background, borderless cards defined only by subtle spacing. `
      + `Single accent color: muted charcoal (#374151) for text and a thin teal (#0D9488) line for active states. `
      + `No shadows, no gradients, no borders — layout and typography carry the entire hierarchy. `
      + `System font stack (SF Pro / Inter). Razor-thin dividers. Apple HIG-inspired restraint.`,
    approach: `Reduction-first — strips every element to its bare minimum, content speaks for itself`,
    pattern: `full-width top-nav with floating content sections and generous vertical rhythm`,
  },
];

interface DesignDirection {
  readonly name: string;
  readonly style: string;
  readonly approach: string;
  readonly pattern: string;
}

/**
 * Google Stitch design generation service.
 *
 * Creates real designs on stitch.withgoogle.com that the user can visit
 * and interact with. Uses Gemini to craft creative design prompts, then
 * drives Playwright to submit each prompt to Stitch's web UI.
 *
 * Always generates 6 designs with distinct color schemes, approaches,
 * and design patterns. Design #4 is always an AI-Embedded Command
 * Palette variant. Design #6 is always a Minimalist White variant.
 * Every design includes a landing page as the first screen.
 */
export class StitchService {

  private readonly logger: Logger;
  private readonly apiKey: string;
  private readonly designCount: number;
  private readonly gemini: ChatGoogleGenerativeAI;

  constructor(logger: Logger, apiKey: string, designCount: number) {
    this.logger = logger;
    this.apiKey = apiKey;
    this.designCount = Math.max(designCount, DESIGN_DIRECTIONS.length); // Always match direction count
    this.gemini = new ChatGoogleGenerativeAI({
      model: `gemini-2.5-flash`,
      temperature: 0.7,
      apiKey: this.apiKey,
    });
  }

  /**
   * Generate design prompts via Gemini using the 5 fixed design
   * directions, then submit each to stitch.withgoogle.com via Playwright.
   *
   * Returns StitchDesign objects with real preview/edit URLs.
   */
  async generateDesigns(
    inspiration: DribbbleDesign,
    prdContent: string,
    projectTitle: string,
    designNotes: { colorPalette: string; layoutPattern: string; keyComponents: readonly string[] },
    pw: StitchPlaywrightCallbacks,
  ): Promise<Result<StitchDesign[], Error>> {
    this.logger.info(`Generating ${this.designCount} Stitch designs (5 directions, each with landing page)`);

    // Step 1: Use Gemini to craft a Stitch prompt for each design direction
    const prompts = await this.generateDesignPrompts(
      inspiration, prdContent, projectTitle, designNotes,
    );

    if (prompts.length === 0) {
      return err(new Error(`Failed to generate design prompts via Gemini`));
    }

    this.logger.info(`Generated ${prompts.length} design prompts, submitting to Stitch...`);

    // Step 2: Submit each prompt to stitch.withgoogle.com via Playwright
    const designs: StitchDesign[] = [];

    for (let i = 0; i < prompts.length; i++) {
      const prompt = prompts[i];
      const direction = DESIGN_DIRECTIONS[i];
      if (!prompt || !direction) continue;

      try {
        const design = await retryWithBackoff(
          () => this.submitToStitch(prompt, i, projectTitle, direction, pw),
          {
            maxAttempts: 3,
            baseDelayMs: 5000,
            maxDelayMs: 30000,
            label: `Stitch submission "${direction.name}"`,
          },
          this.logger,
        );
        designs.push(design);
        this.logger.info(`Stitch design ${i + 1}/${prompts.length} created`, {
          id: design.id,
          name: design.name,
          direction: direction.name,
          previewUrl: design.previewUrl,
        });
      } catch (error) {
        this.logger.warn(`Stitch submission ${i + 1} (${direction.name}) failed after retries`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (designs.length === 0) {
      return err(new Error(`All Stitch submissions failed`));
    }

    return ok(designs);
  }

  /**
   * Use Gemini to turn each design direction into a concrete Stitch prompt.
   *
   * Every prompt mandates a landing page as the first screen.
   */
  private async generateDesignPrompts(
    inspiration: DribbbleDesign,
    prdContent: string,
    projectTitle: string,
    designNotes: { colorPalette: string; layoutPattern: string; keyComponents: readonly string[] },
  ): Promise<string[]> {
    const directions = DESIGN_DIRECTIONS.slice(0, this.designCount);

    const directionsBlock = directions.map((d, i) =>
      `${i + 1}. **${d.name}** — ${d.style}\n   Approach: ${d.approach}\n   Pattern: ${d.pattern}`,
    ).join(`\n\n`);

    const response = await this.gemini.invoke([
      new SystemMessage(
        `You are a UI/UX design prompt writer for Google Stitch (stitch.withgoogle.com).\n\n` +
        `Generate exactly ${directions.length} design prompts. Each prompt MUST:\n` +
        `1. **LANDING PAGE FIRST** — The very first screen Stitch generates MUST be a landing page ` +
        `with a hero section, headline, feature highlights, CTA button, and social proof. ` +
        `Begin every prompt with: "Starting with a landing page featuring..." to ensure Stitch renders it first.\n` +
        `2. Then describe the main dashboard and key app screens.\n` +
        `3. Follow the specific style direction, color scheme, and design pattern given.\n` +
        `4. Be 4-6 sentences, specific about colors (hex values), layout, typography, and components.\n\n` +
        `IMPORTANT: Design #4 MUST describe an AI-Embedded Command Palette (⌘K / Spotlight-style) ` +
        `as the primary navigation and interaction pattern.\n` +
        `IMPORTANT: Design #6 MUST be an ultra-minimalist pure white design.\n\n` +
        `Respond with ONLY a JSON array of strings:\n` +
        `\`\`\`json\n["prompt 1", "prompt 2", ...]\n\`\`\``,
      ),
      new HumanMessage(
        `Generate ${directions.length} Google Stitch prompts for "${projectTitle}".\n\n` +
        `## Design Inspiration\n` +
        `"${inspiration.title}" — ${designNotes.colorPalette}\n\n` +
        `## Design Directions\n\n${directionsBlock}\n\n` +
        `## App Description\n` +
        `A web portal for high school personal trainers managing athletes in powerlifting, ` +
        `football, baseball, and basketball. Features: landing page, athlete roster with filters, ` +
        `workout logging with exercise tracking, performance metrics with charts and PR boards, ` +
        `nutrition tracking with macro breakdowns, and training plan builder.\n\n` +
        `## PRD Excerpt\n${prdContent.slice(0, 1500)}`,
      ),
    ]);

    const content = typeof response.content === `string`
      ? response.content
      : JSON.stringify(response.content);

    const jsonMatch = content.match(/```json\s*([\s\S]*?)```/) ?? content.match(/(\[[\s\S]*\])/);
    if (!jsonMatch?.[1]) {
      this.logger.warn(`Failed to parse Gemini prompt response, using fallback prompts`);
      return this.buildFallbackPrompts(projectTitle, designNotes);
    }

    try {
      const parsed = JSON.parse(jsonMatch[1].trim()) as string[];
      if (!Array.isArray(parsed) || parsed.length < directions.length) {
        return this.buildFallbackPrompts(projectTitle, designNotes);
      }
      return parsed.slice(0, directions.length);
    } catch {
      return this.buildFallbackPrompts(projectTitle, designNotes);
    }
  }

  /**
   * Navigate to stitch.withgoogle.com, enter the prompt, submit it,
   * and capture the resulting design URL.
   */
  private async submitToStitch(
    prompt: string,
    variationIndex: number,
    projectTitle: string,
    direction: DesignDirection,
    pw: StitchPlaywrightCallbacks,
  ): Promise<StitchDesign> {
    const designId = ulid();
    const variationName = `${projectTitle} — ${direction.name}`;

    // Navigate to Stitch home (fresh page for each design)
    this.logger.info(`[${variationIndex + 1}] Opening Stitch for "${direction.name}"...`);
    await pw.navigate(`https://stitch.withgoogle.com/`);
    await pw.waitFor(3000);

    // Stitch renders its UI inside a cross-origin iframe, so ariaSnapshot()
    // can't reach the form elements. Use direct CSS selectors via fillSelector/clickSelector.

    // Step 1: Wait for prompt input to be available (retry with backoff)
    const promptSelectors = [
      `[contenteditable="true"]`,
      `[role="textbox"]`,
      `textarea`,
      `input[type="text"]`,
    ];

    let filled = false;
    for (let attempt = 0; attempt < 3 && !filled; attempt++) {
      if (attempt > 0) {
        this.logger.info(`Retry ${attempt}: waiting for prompt input...`);
        await pw.waitFor(3000);
      }
      for (const selector of promptSelectors) {
        try {
          await pw.fillSelector(selector, prompt);
          filled = true;
          this.logger.info(`Filled prompt via: ${selector}`);
          break;
        } catch {
          this.logger.debug(`Selector ${selector} failed (attempt ${attempt + 1})`);
        }
      }
    }

    if (!filled) {
      this.logger.warn(`Could not fill prompt via any selector — falling back to URL query string`);
      const encodedPrompt = encodeURIComponent(prompt.slice(0, 2000));
      await pw.navigate(`https://stitch.withgoogle.com/?prompt=${encodedPrompt}`);
      await pw.waitFor(5000);
    } else {
      await pw.waitFor(1000);

      // Step 2: Select "Web" mode
      const webSelectors = [
        `button:has-text("Web")`,
        `[role="radio"]:has-text("Web")`,
        `label:has-text("Web")`,
      ];
      for (const selector of webSelectors) {
        try {
          await pw.clickSelector(selector);
          this.logger.info(`Selected Web mode via: ${selector}`);
          break;
        } catch {
          this.logger.debug(`Web mode selector ${selector} failed`);
        }
      }
      await pw.waitFor(500);

      // Step 3: Click Generate
      const submitSelectors = [
        `button[aria-label="Generate designs"]`,
        `button:has-text("Generate designs")`,
        `button:has-text("Generate")`,
        `button:has-text("Start designing")`,
      ];
      let submitted = false;
      for (const selector of submitSelectors) {
        try {
          await pw.clickSelector(selector);
          this.logger.info(`Clicked submit via: ${selector}`);
          submitted = true;
          break;
        } catch {
          this.logger.debug(`Submit selector ${selector} failed`);
        }
      }

      if (submitted) {
        // Wait for Stitch to generate and redirect to /projects/<id>
        this.logger.info(`Waiting for Stitch generation...`);
        for (let wait = 0; wait < 12; wait++) {
          await pw.waitFor(5000);
          const currentUrl = await pw.getCurrentUrl();
          if (currentUrl.includes(`/projects/`)) {
            this.logger.info(`Stitch redirected to: ${currentUrl}`);
            break;
          }
          this.logger.debug(`Still generating... (${(wait + 1) * 5}s) url: ${currentUrl}`);
        }
      }
    }

    // Get the actual browser URL (not from snapshot — snapshot can't see inside the iframe)
    await pw.screenshot();
    const designUrl = await pw.getCurrentUrl();
    const isProjectUrl = designUrl.includes(`/projects/`);

    if (!isProjectUrl) {
      this.logger.warn(`Stitch did not redirect to a project URL: ${designUrl}`);
    } else {
      this.logger.info(`Design URL: ${designUrl}`);
    }

    return {
      id: designId,
      name: variationName,
      previewUrl: designUrl,
      editUrl: designUrl,
      thumbnailDataUri: ``,
      description: `[${direction.name}] ${direction.approach} — ${prompt.slice(0, 120)}...`,
    };
  }

  // ── Snapshot parsers ──────────────────────────────────────────────

  private findPromptInput(snap: string): string | null {
    const patterns = [
      /textbox\s*\[active\]\s*\[ref=([^\]]+)\]/i,
      /textbox[^\n]*ref=([^\]\s]+)/i,
      /textarea[^\n]*ref=([^\]\s]+)/i,
      /searchbox[^\n]*ref=([^\]\s]+)/i,
      /combobox[^\n]*ref=([^\]\s]+)/i,
    ];
    for (const pattern of patterns) {
      const match = pattern.exec(snap);
      if (match?.[1]) {
        this.logger.debug(`findPromptInput matched pattern: ${pattern.source} → ref=${match[1]}`);
        return match[1];
      }
    }
    this.logger.warn(`findPromptInput: no input element found in snapshot`);
    return null;
  }

  private findWebRadio(snap: string): string | null {
    const match = /radio\s+"Web"\s*\[ref=([^\]]+)\]/i.exec(snap);
    if (match?.[1]) this.logger.debug(`findWebRadio → ref=${match[1]}`);
    else this.logger.debug(`findWebRadio: "Web" radio not found`);
    return match?.[1] ?? null;
  }

  private findSubmitButton(snap: string): string | null {
    // Try exact match first, then broader patterns
    const patterns = [
      /button\s+"Generate designs"\s*\[ref=([^\]]+)\]/i,
      /button\s+"Generate"\s*\[ref=([^\]]+)\]/i,
      /button[^\n]*Generate[^\n]*ref=([^\]\s]+)/i,
    ];
    for (const pattern of patterns) {
      const match = pattern.exec(snap);
      if (match?.[1]) {
        this.logger.debug(`findSubmitButton matched: ${pattern.source} → ref=${match[1]}`);
        return match[1];
      }
    }
    this.logger.debug(`findSubmitButton: no Generate button found`);
    return null;
  }

  // ── Fallback prompts ──────────────────────────────────────────────

  private buildFallbackPrompts(
    projectTitle: string,
    designNotes: { colorPalette: string; layoutPattern: string; keyComponents: readonly string[] },
  ): string[] {
    const components = designNotes.keyComponents.join(`, `);
    const landing = `Start with a landing page featuring a hero section, key feature highlights, and a CTA button.`;

    return [
      `${landing} Design a clean minimal "${projectTitle}" web app with light #F9FAFB background, dark navy #0A192F sidebar, blue #0052CC accents, flat metric cards, and clean data tables. ${components}.`,
      `${landing} Design a bold athletic "${projectTitle}" with dark #0F172A theme, vibrant orange #FF6B35 accents, gradient headers, large metric numbers, card-heavy dashboard. ${components}.`,
      `${landing} Design a data-dense professional "${projectTitle}" in black #09090B dark mode with electric blue #3B82F6 glow accents, compact spacing, sparkline charts in tables, split-pane layout. ${components}.`,
      `${landing} Design an AI-first "${projectTitle}" centered on a ⌘K command palette overlay for navigation and actions. Dark #18181B background, violet #7C3AED AI accents, monospace command input, contextual preview panels. Natural language queries like "show bench press history". ${components}.`,
      `${landing} Design a warm approachable "${projectTitle}" with cream #FFFBEB background, brown #78350F sidebar, terracotta #C2410C accents, rounded cards, friendly Nunito typography. Welcoming for high school athletes. ${components}.`,
      `${landing} Design an ultra-minimalist white "${projectTitle}" with pure #FFFFFF background, no shadows, no borders. Charcoal #374151 text, thin teal #0D9488 active indicators. System font, razor-thin dividers, maximum negative space. Apple HIG-inspired restraint. ${components}.`,
    ];
  }
}
