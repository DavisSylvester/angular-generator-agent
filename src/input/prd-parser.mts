import { readFile } from 'node:fs/promises';
import type { Logger } from 'winston';
import type { Result } from '../types/index.mts';
import { ok, err } from '../types/index.mts';

export interface StructuredPrd {
  readonly kind: `structured`;
  readonly content: string;
  readonly title: string;
  readonly sections: readonly string[];
}

export interface RawTextPrd {
  readonly kind: `raw`;
  readonly rawText: string;
}

export type ParsedPrd = StructuredPrd | RawTextPrd;

/**
 * Parse a PRD file. If the file contains markdown headings, returns a
 * structured result. If it is plain text (no headings), returns a raw
 * result so the caller can generate a proper PRD via LLM.
 */
export async function parsePrd(filePath: string, logger: Logger): Promise<Result<ParsedPrd, Error>> {
  try {
    const content = await readFile(filePath, `utf-8`);

    if (!content.trim()) {
      return err(new Error(`PRD file is empty: ${filePath}`));
    }

    const parsed = parseStructuredContent(content);

    if (parsed.sections.length === 0) {
      logger.info(`PRD has no markdown headings — treating as raw text`, { chars: content.length });
      return ok({ kind: `raw`, rawText: content });
    }

    logger.info(`PRD parsed`, { title: parsed.title, sections: parsed.sections.length, chars: content.length });
    return ok(parsed);
  } catch (error) {
    return err(
      error instanceof Error
        ? error
        : new Error(`Failed to read PRD: ${String(error)}`),
    );
  }
}

/**
 * Extract title and section headings from markdown content.
 * Used both by `parsePrd` and to re-parse LLM-generated PRD markdown.
 */
export function parseStructuredContent(content: string): StructuredPrd {
  const titleMatch = content.match(/^#\s+(.+)/m);
  const title = titleMatch?.[1]?.trim() ?? `Untitled PRD`;

  const headingPattern = /^#{1,3}\s+(.+)/gm;
  const sections: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = headingPattern.exec(content)) !== null) {
    if (match[1]) {
      sections.push(match[1].trim());
    }
  }

  return { kind: `structured`, content, title, sections };
}
