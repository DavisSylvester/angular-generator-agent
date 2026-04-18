# Example — Full Stack Developer Dashboard

> **First tuning case for the Panel Model pattern.**
> The pattern docs at `docs/ui-plan/00-plan.md` → `03-visual-validation.md` are the governing spec. This example applies that spec to a specific reference image and reports what it learned.

---

## Reference

- Source: [`reference.png`](reference.png) — a dark-themed telemetry dashboard titled *FULL STACK DEVELOPER*, ~1820 × 920 px.
- Why this reference: dense, multi-panel layout with nested Panels (`AlarmStats → Online/Alarms/SLA`), live regions, charts, and a repeating list — exercises most of the pattern's slot contract in a single page.

> **Note:** if `reference.png` is not yet committed, place the screenshot used in the chat there. The region bboxes in `regions.json` are authored against that exact image at its natural size.

---

## Files in this folder

| File | Purpose |
|---|---|
| `reference.png` | Source of truth image (to be committed) |
| `decomposition.md` | Full Panel tree applying the pattern to this reference |
| `regions.json` | Bounding boxes per Panel id, consumed by visual validation |
| `atoms-delta.md` | Atoms proposed by this example for possible promotion into the pattern |
| `tuning-notes.md` | Observations that may update the pattern docs upstream |

---

## Status

- [x] Decomposition tree authored (`decomposition.md`)
- [x] `reference.png` committed (1905×953)
- [x] `regions.json` authored (v4 — 47 regions)
- [x] Stage A baseline capture verified (`visual-baselines/full-stack-dashboard/*.png`, overlay diagnostic at `_overlay.png`)
- [ ] `atoms-delta.md` reviewed for promotion
- [ ] `tuning-notes.md` folded back into the pattern

## Test run — 2026-04-18

Ran the pattern against the reference by generating Stage A baselines and visually overlaying every bbox on the source image (`_overlay.png`). Structural findings:

- Decomposition tree **matched reality** — every Panel identified in `decomposition.md` has a locatable region in the image, with no missing or extra nodes.
- 5-slot contract held — every region decomposed cleanly into Frame / Header / Body / Footer / Status without needing a 6th slot.
- AlarmStats canonical case (Online / Alarms / SLA) validated — all three sub-Panels cropped cleanly with accent bars in the correct position.
- Column widths are **asymmetric**: Col A ~580, Col B ~475, Col C ~760 px. The pattern doesn't prescribe symmetry, so this fits without a change.
- Panel boundaries in this reference are **perceptual** (subtle label strips, dotted separators) rather than hard borders; automated boundary detection by pixel brightness was unreliable. See tuning-notes item §9.

---

## Role in the pattern

This example is where the Panel Model gets stress-tested. Findings flow **upstream** to the pattern docs per [`../../02-decomposition-process.md`](../../02-decomposition-process.md) §8. The pattern is not considered v1.0 until this example decomposes without awkward phrasing and every atom used here lives in the pattern catalogue (not in `atoms-delta.md`).
