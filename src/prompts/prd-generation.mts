import { loadPrompt } from "./load-prompt.mts";

export const PRD_GENERATION_SYSTEM_PROMPT = await loadPrompt("prd-generation.md");
