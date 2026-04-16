import { loadPrompt } from "./load-prompt.mts";

export const CODEGEN_SYSTEM_PROMPT = await loadPrompt("codegen.md");
