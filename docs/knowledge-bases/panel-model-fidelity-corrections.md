# Knowledge Base: Panel Model Fidelity Corrections

> **Living log.** Each entry records a visual-fidelity miss found between the generated Panel implementation and the authoritative reference in `docs/ui-plan/examples/<example-id>/reference.png`.
>
> **Purpose.** Future generation runs must ingest this file so the same mistakes do not repeat. The entries describe *not just the fix* but *why the miss happened* so the failure mode itself is captured, not just its symptom.
>
> **How the agent uses this.** `docs/prompts/visual-fidelity.md` and `docs/prompts/codegen.md` both reference this file. Any Panel/Atom generation or correction must load it and apply every relevant rule as a hard constraint.
>
> **Entry format.** Each correction uses the same six-field template so the agent can parse, index, and cross-reference them.

---

## Template — copy for every new entry

```markdown
## <N>. <Short title> — <YYYY-MM-DD>

**Where.** Example id · Panel id · Atom affected.

**Symptom.** What the generated render looked like (briefly, one or two sentences).

**Reference shows.** What the authoritative reference actually contains — specific visual elements, sizes, alignment, color roles.

**Why it was missed.** Root cause in the decomposition / prompt / atom catalogue. Be concrete — name the doc and line of the oversight.

**Correction (pattern-level).** Changes to `00-plan.md` / `01-panel-interface.md` / `02-decomposition-process.md` / atom catalogue. What future generations must produce.

**Correction (example-level).** Changes to `examples/<id>/decomposition.md` and any mock data.

**Prevention hint.** One sentence the agent must echo as a self-check when it generates a similar region next time.
```

---

## 1. Stat atom missing segmented activity indicator + mis-sized "ACTIVE/ALL" label — 2026-04-18

**Where.** `full-stack-dashboard` · `alarm-stats.online` (and siblings `.alarms`, `.sla`) · `Stat` atom + missing `ActivityIndicator` atom.

**Symptom.** The rendered AlarmStats sub-Panels showed:
- A single full-width accent bar under each stat (single-color `AccentRule`).
- Tiny, centered "ACTIVE / ALL" label text positioned below the numeral as one uppercase string in `--t-xs`.

**Reference shows.** Each AlarmStats sub-Panel has:
- The numeral "102" left-aligned. "/ 109" trails it in a muted color.
- Below the numeral, two labels side-by-side — **"ACTIVE"** under the left numeral, **"ALL"** under the denominator — both at `--t-sm` / `--t-md`, left-aligned, uppercase, tracked.
- Below the labels, **four equal-width tick bars** (short horizontal segments). The leftmost two are **filled** in the sub-Panel's status color (teal for ok, amber for warn). The rightmost two are **outlined** only (same color, hollow). Gap between segments is ~`--sp-1`.
- The four bars together form a segmented activity indicator, not a continuous rule.

**Why it was missed.**

_Artifact-level reasons:_
1. `docs/ui-plan/examples/full-stack-dashboard/decomposition.md` §8.1 described the sub-Panels as ending in `Footer: · AccentRule color=ok` — a single bar — whereas the reference has a 4-segment indicator.
2. `01-panel-interface.md` §6 did not include a `SegmentedBar` / `ActivityIndicator` atom, so the decomposition had nowhere to map the correct shape and fell back to `AccentRule`.
3. In the `Stat` atom spec, `label` was defined as a single string. The reference splits the label into two positionally-aligned halves. The spec lost this coupling.
4. Visual inspection during decomposition was done at low zoom; the 4-tick motif was read as a single bar.

_Deeper root causes — why the miss happened in the first place:_

1. **Shape-to-name pattern-matching before observation.** The decomposer (me) saw *"short horizontal colored element at the bottom of the sub-Panel"* and immediately reached for an already-named atom in the catalogue (`AccentRule`) instead of first *describing what was literally there*. The pipeline went: "see shape → recall nearest atom → write it down." The correct pipeline is: "see shape → describe pixels → count segments → describe fills vs outlines → **then** decide which atom (or propose a new one)." The shortcut saves time per region but silently loses detail.

2. **The "generic motif" priming in `00-plan.md` §2.3.** Writing "Accent underline — 2px cyan bar" into the pattern's visual-motifs table before analyzing any specific reference created a strong prior. Every subsequent horizontal element at a Panel bottom looked like that motif. The pattern doc was meant to describe what the pattern guarantees — it accidentally functioned as a template that the decomposition author filled in.

3. **Decomposition happened from memory, not while looking at the image.** The tree in `decomposition.md` was written in one pass, describing every Panel's five slots in sequence. Because I was writing prose at the keyboard rather than reading pixels, micro-details (segment count, fill vs outline, label alignment) were filled in by pattern-matching rather than observation. *An overlay diagnostic would not catch this*; the overlay verifies *region bounds*, not *internal motifs*.

4. **The validation loop I built only checked geometry, not semantics.** Stage A capture and the overlay (`scripts/overview-strip.mts`) verify that a bounding box covers the right area. Neither tool asks *"did the atoms inside match what's in this crop?"* The per-region crop PNGs were available the whole time — I did not re-examine them for atom-level detail before writing the decomposition.

5. **Absence of a "describe-before-name" discipline.** The decomposition process (`02-decomposition-process.md` §2) jumps from "identify Body" to "match to atom catalogue" without an intermediate "write a literal visual description of the content in prose, then pick an atom." The missing step is where observation would dominate recall.

6. **Atom catalogue bias toward already-proposed items.** `atoms-delta.md` was populated while reading the image once; once `AccentRule` was in the list, it became the answer to every "colored horizontal thing" question instead of the seed for one specific use site. Atoms should be proposed per-occurrence first, deduplicated second — not the other way around.

7. **Resolution/zoom bias.** The reference was inspected at fit-to-window zoom throughout decomposition. At that zoom, four 12px segments with 4px gaps read as one continuous bar. I never zoomed in while writing §8.1, and never cross-referenced the sub-Panel crops (which would have shown the segments clearly at 206×110 render size).

8. **No per-atom sanity assertion.** For every atom named in the decomposition, there was no step asserting *"this atom can actually render what the reference shows here."* If I had to answer the question "can `AccentRule(color=ok)` produce the visual in the crop?" the answer would have been "no — `AccentRule` is one bar, the reference has four distinct tick marks," and the miss would have been caught at decomposition time instead of post-implementation.

_Process changes implied_ (captured below in "Correction (pattern-level)"): add a describe-before-name step to `02-decomposition-process.md`; add a per-atom render-feasibility assertion; require per-region crops be opened and inspected *at native pixel size* during decomposition; stop priming motif examples in `00-plan.md` without observation.

---

## 2. Stat split-label alignment and ActivityIndicator fill contrast — 2026-04-18

**Where.** `full-stack-dashboard` · `alarm-stats.online` · `Stat` atom layout + `ActivityIndicator` atom fill treatment.

**Symptom.** After KB §1 was applied:
- The `labelLeft` and `labelRight` ("ACTIVE" and "ALL") both rendered clustered against the left edge of the Stat host, not under their corresponding numerator / denominator.
- The four indicator segments rendered with the two "off" segments only faintly distinguishable from the "on" segments — effectively all four read as filled at native size.

**Reference shows.**
- "ACTIVE" is left-aligned directly under "102" (numerator). "ALL" is left-aligned directly under "109" (denominator). The horizontal position of each label mirrors the horizontal position of its numeric half in the row above.
- The four indicator segments split cleanly into two groups: the left pair is solid filled in the status color; the right pair is **outlined only** — a visible hollow rectangle with a clearly drawn border and no fill. The outlined pair reads as *absent* at a glance.

**Why it was missed.**

1. **The Stat SCSS `pm-stat__labels` grid did not mirror `pm-stat__row`.** I wrote `grid-template-columns: auto auto 1fr auto` with `grid-template-areas: 'left . right .'` assuming that placing items in columns 1 and 3 would align them under the row's columns 1 and 3 (value and denom). But because the two grids are siblings (not nested in a single grid), browsers size each grid *independently* by content — a standalone labels grid of "ACTIVE" + "ALL" has both items hug the left because there's nothing to stretch column 3. **A shared alignment across two separate grids requires either a shared parent `display: grid` with named columns, or explicit column widths pinned to match.**
2. **I did not re-open the reference sub-Panel crop at native size after coding the fix.** I wrote the SCSS, built, and asserted "labels are now split" without comparing pixel-for-pixel against `visual-baselines/full-stack-dashboard/alarm-stats.online.png`. Same failure mode as KB §1: coding from memory rather than observation.
3. **ActivityIndicator fill treatment used `opacity: 0.5 + inset box-shadow`.** At `height: var(--bw-accent)` = 2px, an inset 1px box-shadow is visually nearly identical to a faded 2px fill. **Outlined-vs-filled contrast at segment heights ≤ 3px needs a different strategy**: either taller segments (height = `var(--sp-1)` or more) so the border has room to be seen, or outlined segments rendered as true open rectangles with transparent interior and full-opacity border.
4. **No observational assertion in the atom itself.** `ActivityIndicatorComponent` spec said "outlined" without committing to a specific visual test (e.g., "at the smallest segment size, the outlined segments must have an interior that is clearly transparent, i.e., the panel background must show through"). The atom shipped with a fill strategy that fails this test; nothing in the spec objected.

**Correction (pattern-level).**

- **`Stat` atom — align labels under numerator/denominator via a single shared grid.** Update `01-panel-interface.md` §6.1: "Stat lays out its numeral row and split-label row in a **single CSS grid** (not two siblings) so that column 1 (value + labelLeft) and column 3 (denominator + labelRight) align vertically. Any implementation that uses two separate sibling grids for these rows is non-conformant."
- **`ActivityIndicator` atom — outlined segments must be visibly hollow.** Update §6.4: "`segmentHeight?: string` (default `var(--sp-1)` = 4px, minimum 3px). Outlined segments render as `background: transparent` + `border: var(--bw-hair) solid var(--pm-indicator-color)`. Opacity-dimmed filled segments are not a substitute."
- Add a **visual-fidelity assertion** to the Stat and ActivityIndicator test contracts in `01-panel-interface.md` §9: a tolerance-diff against the per-atom baseline crop at the crop's native pixel size (`alarm-stats.online.png` = 206×110).

**Correction (example-level).**

- `examples/full-stack-dashboard/decomposition.md` §8.1 — annotate the `ActivityIndicator` call with the height hint: `★ ActivityIndicator total=4 active=2 status=ok segmentHeight=var(--sp-1)`.

**Prevention hint.** After every atom correction: open the authoritative per-atom baseline crop *at native pixel size* alongside the live render. If the eye cannot distinguish two segments that should read as "on" vs "off," the correction is incomplete — even if the CSS is syntactically different.

---

**Correction (pattern-level).**
- **Add new atom `ActivityIndicator`** to `01-panel-interface.md` §6:
  - Inputs: `total: number` (default 4), `active: number`, `status: PanelStatus`.
  - Renders N equal-width segments; first `active` are filled with status color, remaining are outlined with the same color + `background: transparent`.
  - Min size: width `--sp-5`, height `--sp-1`. Gap: `--sp-1`.
- **Extend `Stat` atom inputs** in `01-panel-interface.md` §6.1 to support a two-part label:
  - Replace single `label?: string` with `labelLeft?: string` and `labelRight?: string` (keep `label` as a fallback that renders centered, for backwards-compatible single-label stats).
  - When both `labelLeft` and `labelRight` are provided, render a 2-column grid matching the numeral / denominator grid above.
- **Promote `SegmentedBar` motif** to `00-plan.md` §2.3 as a recognized visual motif: *"Segmented activity indicator — N equal-width ticks, M filled / (N−M) outlined, conveys a fractional state."*
- **Remove `AccentRule` from the decomposition of Stat-bearing sub-Panels** when the reference shows segments; `AccentRule` remains valid for nav underlines and true single-bar contexts only.

**Correction (example-level).**
- `examples/full-stack-dashboard/decomposition.md` §8.1 — replace `· AccentRule color=<status>` with `★ ActivityIndicator total=4 active=2 status=<status>` under each of Online / Alarms / SLA.
- `atoms-delta.md` — move `AccentRule` from `proposed` to `accepted` (still needed elsewhere), and add `ActivityIndicator` as `proposed → accepted`.
- `decomposition.md` atom catalogue — add `ActivityIndicator` row.

**Prevention hint.** Before calling any repeating horizontal motif an `AccentRule`, count the segments. If N > 1 **or** the segments differ visually (filled vs outlined, colored vs muted), it is an `ActivityIndicator` (or `SegmentedBar` or `TickGroup`), not an `AccentRule`.

---
