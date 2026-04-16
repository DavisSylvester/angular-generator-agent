import { join } from "path";

const PROMPTS_DIR = join(import.meta.dir, "..", "..", "docs", "prompts");

export function loadPrompt(filename: string): Promise<string> {
  return Bun.file(join(PROMPTS_DIR, filename)).text();
}
