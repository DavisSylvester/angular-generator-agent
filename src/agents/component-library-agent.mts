import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { BaseAgent } from './base-agent.mts';
import type {
  ComponentLibrary,
  ComponentLibraryEntry,
  ComponentLibraryFile,
  ComponentCategory,
  DribbbleDesign,
  StitchDesign,
} from '../types/index.mts';
import { COMPONENT_LIBRARY_SYSTEM_PROMPT } from '../prompts/component-library.mts';

export interface ComponentLibraryInput {
  readonly inspiration: DribbbleDesign;
  readonly chosenDesign: StitchDesign;
  readonly designNotes: {
    readonly colorPalette: string;
    readonly layoutPattern: string;
    readonly keyComponents: readonly string[];
  };
  readonly prdContent: string;
  readonly projectTitle: string;
}

export class ComponentLibraryAgent extends BaseAgent<ComponentLibraryInput, ComponentLibrary> {

  protected async execute(input: ComponentLibraryInput, model: BaseChatModel): Promise<ComponentLibrary> {
    const messages = [
      new SystemMessage(COMPONENT_LIBRARY_SYSTEM_PROMPT),
      new HumanMessage(this.buildUserPrompt(input)),
    ];

    const response = await model.invoke(messages);
    const content = typeof response.content === `string`
      ? response.content
      : JSON.stringify(response.content);

    return this.parseLibraryResponse(content);
  }

  private buildUserPrompt(input: ComponentLibraryInput): string {
    return [
      `## Project: ${input.projectTitle}`,
      ``,
      `## Design Inspiration`,
      `- **Dribbble:** ${input.inspiration.title} by ${input.inspiration.author}`,
      `- **URL:** ${input.inspiration.url}`,
      ``,
      `## Selected Stitch Design`,
      `- **Name:** ${input.chosenDesign.name}`,
      `- **Description:** ${input.chosenDesign.description}`,
      ``,
      `## Design Notes (from evaluation)`,
      `- **Color Palette:** ${input.designNotes.colorPalette}`,
      `- **Layout Pattern:** ${input.designNotes.layoutPattern}`,
      `- **Key Components:** ${input.designNotes.keyComponents.join(`, `)}`,
      ``,
      `## PRD`,
      input.prdContent,
    ].join(`\n`);
  }

  private parseLibraryResponse(content: string): ComponentLibrary {
    const files = this.extractCodeFiles(content);

    // Separate design tokens from component files
    let designTokens: ComponentLibraryFile = {
      path: `src/app/shared/styles/_tokens.scss`,
      content: `:root {\n  --color-primary: #1976d2;\n}`,
    };

    const componentFileMap = new Map<string, ComponentLibraryFile[]>();

    for (const file of files) {
      if (file.path.includes(`_tokens.scss`) || file.path.includes(`tokens.scss`)) {
        designTokens = file;
        continue;
      }

      // Group files by component directory
      const componentDir = this.extractComponentDir(file.path);
      if (!componentFileMap.has(componentDir)) {
        componentFileMap.set(componentDir, []);
      }
      componentFileMap.get(componentDir)?.push(file);
    }

    // Build component entries from grouped files
    const components: ComponentLibraryEntry[] = [];
    for (const [dir, componentFiles] of componentFileMap) {
      const name = this.extractComponentName(dir);
      components.push({
        name,
        selector: `app-${name}`,
        category: this.inferCategory(name),
        files: componentFiles,
      });
    }

    return { designTokens, components };
  }

  private extractCodeFiles(content: string): ComponentLibraryFile[] {
    const files: ComponentLibraryFile[] = [];
    const blockPattern = /```(\w+)\s*\n([\s\S]*?)```/g;

    let match: RegExpExecArray | null;
    while ((match = blockPattern.exec(content)) !== null) {
      const lang = match[1] ?? ``;
      const body = (match[2] ?? ``).trim();

      if (![`typescript`, `ts`, `html`, `scss`].includes(lang)) continue;

      // Extract path from comment on first line
      const pathMatch = body.match(/^(?:\/\/|<!--)\s*(src\/\S+?)(?:\s*-->)?\s*\n/);
      if (!pathMatch?.[1]) continue;

      const path = pathMatch[1];
      const bodyWithoutPath = body.slice(pathMatch[0].length);

      files.push({ path, content: bodyWithoutPath.trim() });
    }

    return files;
  }

  private extractComponentDir(filePath: string): string {
    // src/app/shared/components/card/card.component.ts → card
    const parts = filePath.split(`/`);
    // Find the directory that contains the component files
    for (let i = parts.length - 2; i >= 0; i--) {
      const dir = parts[i] ?? ``;
      if (dir !== `components` && dir !== `shared` && dir !== `app` && dir !== `src` && dir !== `styles`) {
        return dir;
      }
    }
    return parts[parts.length - 2] ?? `unknown`;
  }

  private extractComponentName(dir: string): string {
    // Convert directory name to component name: "metric-card" → "metric-card"
    return dir.replace(/\.component$/, ``);
  }

  private inferCategory(name: string): ComponentCategory {
    if ([`app-shell`, `sidebar`, `header`, `page-layout`, `footer`].includes(name)) return `layout`;
    if ([`nav`, `breadcrumb`, `tab`].includes(name)) return `navigation`;
    if ([`search-input`, `form-field`, `select`, `checkbox`].includes(name)) return `form`;
    if ([`data-table`, `metric-card`, `card`, `status-badge`, `chart`].includes(name)) return `data-display`;
    if ([`loading-skeleton`, `empty-state`, `error-boundary`, `toast`].includes(name)) return `feedback`;
    if ([`confirm-dialog`, `modal`, `drawer`].includes(name)) return `overlay`;
    if ([`token`, `tokens`].includes(name)) return `token`;
    return `utility`;
  }
}
