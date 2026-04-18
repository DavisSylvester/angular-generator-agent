# Tuning Notes — Full Stack Developer Dashboard

> Observations from applying the Panel Model to this reference that may update the pattern upstream.
> Each note is tagged with its proposed destination doc. Accepted notes become PRs against the pattern; rejected notes stay here with a one-line reason.

Legend: `open` · `accepted` · `rejected` · `won't-fix`.

---

## 1. Label strip renders without a Header slot — `open`

**Observation:** the reference shows an uppercase label hovering at the top-left edge of a Panel (e.g. "MODEL RENDER") even when the Panel has no Header slot content inside.

**Proposal:** make `label` an input on `PanelComponent` (already in §4.2) and render it from the Frame regardless of Header projection state. This is already reflected in `01-panel-interface.md` — confirmed during this tuning pass. **No pattern change needed.**

---

## 2. Dual-accent footer (gradient rule) — `open`

**Observation:** AppHeader uses a full-width gradient accent rule, not a solid 2px bar.

**Proposal:** `AccentRule` atom accepts `variant?: 'solid' | 'gradient'` and the default stays `solid`. Extend [`01-panel-interface.md`](../../01-panel-interface.md) §6 when accepted.

**Status:** open — depends on whether `AccentRule` is promoted from `atoms-delta.md`.

---

## 3. Meta rows inside a Header vs. as a sub-Header — `open`

**Observation:** HealthMonitor's Header contains a *row of KvRows* for meta (ID, DATA_SET) plus controls (IconButtons, LiveChip). Is this a single Header with multi-part content, or does the Header itself need slots?

**Proposal:** keep Header as a single projection slot. Sub-structure (title / meta / controls) is a **convention inside Header markup**, not a new slot. Add a doc-only note to [`01-panel-interface.md`](../../01-panel-interface.md) §5.1: "Header content typically groups into `title · meta · controls`; this is a convention, not a contract."

**Status:** open.

---

## 4. Two atoms that might be one — `open`

**Observation:** `NavTab` (AppHeader) and `FilterTab` (ActiveNodes footer) render identically except for location.

**Proposal:** merge into a single `Tab` atom with `variant: 'nav' | 'filter'`. Update `atoms-delta.md` and `01-panel-interface.md` §6 together.

**Status:** deferred to promotion review.

---

## 5. Visual validation needs a "dotted border" attribute check — `open`

**Observation:** several Panels in this reference use a 2px dotted border between Header and Body. The current attribute check list in [`../../03-visual-validation.md`](../../03-visual-validation.md) §5.2 covers solid borders only.

**Proposal:** add a `dotted-separator-density` check: sample a 4px tall strip at the Header/Body boundary and assert the dash/gap pixel ratio is within tolerance of the expected value.

**Status:** open — will write up as a PR against `03-visual-validation.md` §5.2 if accepted.

---

## 6. Region map should support "prototype × N" explicitly — `open`

**Observation:** AlarmList contains N AlarmCard Panels, but visual validation should probably diff only the **prototype** (first card) rather than all of them, because content varies run-to-run.

**Proposal:** `regions.json` entries gain an optional `prototype: true` flag. The validator only diffs prototype entries; subsequent siblings are ignored or sanity-checked for structural equality only.

**Status:** open — needs an update to [`../../03-visual-validation.md`](../../03-visual-validation.md) §3.2 region-map schema.

---

## 7. Typography "weight" check depends on a probe element — `open`

**Observation:** the attribute check `typography-weight` in `03-visual-validation.md` §5.2 relies on a hidden probe. This is reasonable but needs an authoring convention: where does the probe live?

**Proposal:** the app injects a fixed `<div aria-hidden="true" data-visual-probe>` containing a known UTF-8 string at known sizes/weights, removed from layout via `position: absolute; left: -9999px`. Add a one-paragraph note to §5.2.

**Status:** open.

---

## 8. Automated boundary detection is unreliable in low-contrast designs — `open`

**Observation:** on this reference the inter-panel gutters and panel borders are not visually dominant pixels. A column/row brightness scan (scripts/detect-boundaries.mts) found only a single horizontal line (the AppHeader accent rule at y=200) and zero column gutters. Page background (≈35.7 mean brightness) and panel interior (27–46 range) overlap heavily.

**Proposal:** the pattern should not rely on brightness-based boundary detection to author `regions.json`. Options when bboxes are hard to eyeball:

1. **Label-strip detection** — each Panel has a cyan-on-dark label strip in its top-left corner; detect cyan pixels (B high, R low) as Panel origin anchors. This is the most promising automated hook.
2. **Render-then-compare** — build a rough Angular version first, then diff positions to find actual offsets.
3. **Keep it manual** — author bboxes by eye + iterate with overlay diagnostics (what we ended up doing here).

Update [`../../03-visual-validation.md`](../../03-visual-validation.md) §3.3 with: "Bbox authoring is manual. When automated detection is needed, use label-strip cyan-anchor detection; do not rely on brightness deltas alone."

**Status:** open — bake the recommended authoring workflow into the pattern.

---

## 9. Authoring workflow needs an overlay diagnostic — `open`

**Observation:** the first three iterations of `regions.json` had bboxes off by 50–100 px on multiple panels. The fix loop that worked: render every bbox onto the reference as a colored rectangle (`scripts/overview-strip.mts`), visually inspect, adjust, repeat. Three iterations converged to acceptable bboxes.

**Proposal:** promote the overlay diagnostic to a first-class pattern tool under `scripts/overview-strip.mts`, and require it as part of the per-example deliverable. Reference it from [`../../02-decomposition-process.md`](../../02-decomposition-process.md) §6 ("Region Map Production") as **step 3: render and verify the overlay before finalizing `regions.json`.**

**Status:** open — ready to promote; it's already written.

---

## 10. Column widths are asymmetric by design — `open`

**Observation:** this reference uses three columns of ~580, ~475, ~760 px (not equal-fr). The [`00-plan.md`](../../00-plan.md) §4.4 previously hinted at "3 equal columns" — now rewritten to say examples declare their own grid.

**Proposal:** already fixed in the pattern. No further change. This tuning note is closed on the assumption that future examples may want any column shape.

**Status:** accepted (pattern already updated).

---

## 11. What this example has *not* stressed — `open`

Intentional gaps, so future examples can fill them:

- No modal / overlay Panels.
- No form inputs (no controls beyond toggle tabs).
- No empty-state imagery (the design has no vacant regions).
- No responsive breakpoints (reference is desktop-only).

These gaps are not bugs in this tuning case — they define the boundary of what this example proves. Other examples should cover them.
