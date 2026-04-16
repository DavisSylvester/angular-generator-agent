import { loadPrompt } from "./load-prompt.mts";

export const COMPONENT_LIBRARY_SYSTEM_PROMPT = await loadPrompt("component-library.md");
