# Knowledge Base: Visual Fidelity Mismatch Detection

## Problem

Generated SPA pages may compile and render without errors but look nothing like the Stitch design the user selected. The page review (Phase 5b) only checks that routes navigate and elements exist — it does not verify visual appearance.

## Detection Method

After codegen and build succeed, the **Visual Fidelity Agent** must:

1. Take a screenshot of the Stitch design (from the project URL)
2. Take a screenshot of the built app's corresponding page
3. Send both to a multimodal LLM (Gemini) to compare:
   - Color scheme match (primary, accent, background)
   - Layout pattern match (sidebar-nav, card grid, etc.)
   - Component presence (metric cards, data tables, charts)
   - Typography consistency (heading font, body font)
   - Overall aesthetic similarity score (1-10)
4. If similarity < 7, flag the page for regeneration with specific fix instructions

## Common Mismatches

| Issue | Cause | Fix |
|---|---|---|
| Plain text instead of cards | Component overwritten by later batch | Regenerate with explicit Stitch reference |
| Wrong color scheme | Design tokens not imported in SCSS | Add @use '../shared/styles/tokens' |
| Missing sidebar | AppShell not wrapping content | Fix app.component to use <app-shell> |
| No Material styling | Missing Material module imports | Add MatCardModule, MatIconModule, etc. |
| Generic layout | Prompt lacked design specifics | Include hex colors + layout pattern in prompt |

## Model Used

- **Model**: Gemini 2.5 Flash (multimodal — can compare images)
- **Temperature**: 0.1 (precise evaluation, not creative)
- **Input**: Two screenshots (Stitch design + built app) + color palette from `.doc/color-palette.md`
