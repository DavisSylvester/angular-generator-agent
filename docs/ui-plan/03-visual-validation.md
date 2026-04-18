# Visual Validation — Before/After Diff Pipeline

> Governs how generated Angular components are validated against the reference design.
> Hard rule: **no component is considered complete until its rendered output matches its "before picture" within tolerance.**

---

## Table of Contents

1. [Goals](#1-goals)
2. [Pipeline Overview](#2-pipeline-overview)
3. [Stage A — Before Capture](#3-stage-a--before-capture)
4. [Stage B — After Capture](#4-stage-b--after-capture)
5. [Stage C — Diff & Validate](#5-stage-c--diff--validate)
6. [Tolerance Policy](#6-tolerance-policy)
7. [Failure Handling & Fix Loop](#7-failure-handling--fix-loop)
8. [Artifacts](#8-artifacts)
9. [Tooling](#9-tooling)
10. [CI Integration](#10-ci-integration)

---

## 1. Goals

- Lock every feature Panel, atomic leaf, and layout region to a visual baseline extracted from the reference screenshot.
- Detect drift in **color, spacing, typography, border treatment, corner ticks, and iconography** automatically — not via human review.
- Feed visual failures back into the generator's existing fix loop so the LLM iterates until the component matches.
- Keep the validation stage deterministic and CI-runnable — no flaky screenshots.

---

## 2. Pipeline Overview

```
  reference.png
        │
   (A)  │  crop regions                           ┌── per-section baseline PNGs
        ▼                                         │      (committed to /visual-baselines)
  [Before Capture Stage] ────────────────────────►┤
                                                  │
  PRD ──► Plan ──► Codegen ──► Build Angular app  │
                                                  ▼
                              [After Capture Stage]
                                      │  screenshot each section in the running app
                                      ▼
                              [Diff & Validate Stage]
                                      │  pixel + perceptual diff vs baseline
                                      ▼
                           pass ◄─────┴─────► fail → feed diff report into Fix Loop
```

This stage sits **between Codegen and final validation** in the orchestrator, after the app is buildable and servable.

---

## 3. Stage A — Before Capture

### 3.1 Source of truth

Each example owns its own reference image at `examples/<example-id>/reference.png`. The image is never edited; revisions go beside it (`reference-v2.png`) and the region map is versioned alongside.

### 3.2 Region map

Each example authors a JSON file declaring a named bounding box for every Panel and sub-Panel in its decomposition tree:

```
examples/<example-id>/regions.json
```

```json
{
  "reference": "reference.png",
  "viewport": { "w": 1820, "h": 920 },
  "regions": [
    { "id": "page",              "bbox": [0, 0, 1820, 920] },
    { "id": "app-header",        "bbox": [0, 0, 1820, 120] },
    { "id": "some-panel",        "bbox": [...] },
    { "id": "some-panel.child",  "bbox": [...] },
    { "id": "some-list.card.0",  "bbox": [...], "prototype": true }
  ]
}
```

- `id` maps 1:1 to Panel names in the example's `decomposition.md` (process defined in [`02-decomposition-process.md`](02-decomposition-process.md)).
- `bbox` format: `[x, y, w, h]` in source-image pixels.
- Region ids support dot-notation for nested Panels.

### 3.3 Capture procedure

A Playwright script (`scripts/capture-before.mts`) runs once per reference update:

1. Load `reference.png` into a blank HTML page at its natural size (no scaling).
2. For each region in `reference-regions.json`, take a clipped screenshot: `page.screenshot({ clip: bbox })`.
3. Write the PNG to `visual-baselines/<id>.png` (slashes in `id` → subfolders).
4. Produce `visual-baselines/manifest.json` with `{ id, sha256, width, height }` per baseline.

**Outputs are committed to git.** Baselines never regenerate in CI — only by explicit `bun run capture:before`.

---

## 4. Stage B — After Capture

Runs after the Angular app builds and `bun run dev` (or preview build) is up.

### 4.1 Per-section capture

A Playwright test file (`tests/visual/after.spec.mts`) does, for each region in the manifest:

1. Navigate to the route that hosts the section (most live on `/analysis`; atomics on `/atoms`).
2. Locate the target element by a stable `data-visual-id="<region.id>"` attribute.
3. Screenshot that element's bounding box at the same pixel dimensions as the baseline.
4. Write to `visual-actual/<id>.png`.

**`data-visual-id` rule:** every Panel the decomposition tree names sets `data-visual-id` on its host element. The generator enforces this via an ESLint rule — a Panel without `data-visual-id` fails the lint stage.

### 4.2 Viewport & environment

- Fixed viewport: 1820 × 920 (matches reference).
- `prefers-color-scheme: dark`, `prefers-reduced-motion: reduce` — reduced-motion is critical to freeze Live pulses and charts.
- Deterministic mock data — the app reads from a fixed fixture (`mocks/dashboard.fixture.json`) so the chart line and stats are identical run-to-run.
- Disable the WebGL Model Render during capture; use the static fallback PNG (prevents GPU/driver variance).
- Wait strategy: `page.waitForLoadState('networkidle')` + a `data-ready="true"` attribute the app sets once all Panels hydrate.

---

## 5. Stage C — Diff & Validate

### 5.1 Diff algorithm

Two passes, in order:

1. **Pixel diff** (`pixelmatch`): counts mismatched pixels with antialiasing tolerance. Fast, catches color/position drift.
2. **Perceptual diff** (`odiff` or `resemblejs`): catches subpixel font rendering and blur that pixelmatch over-reports.

A section passes when **both** metrics fall under their thresholds.

### 5.2 Per-attribute checks (OCR-free extractors)

In addition to image diff, specific visual attributes are validated structurally so we get useful error messages (not "47 pixels differ"):

| Check | How |
|---|---|
| **Border color** | Sample 10 pixels along each edge of the region; compare dominant color to token `--line` ± 3 in each channel |
| **Corner ticks present** | Sample the four corners at 6px inset; assert foreground pixels match accent color |
| **Label strip color & position** | Look for accent-colored pixels in the top-left 160×16px strip |
| **Background color** | Sample center of Body region; compare to `--bg-1` ± 2 |
| **Accent underline** | Check bottom 2px row for `--fg-accent` when `[accent]="true"` |
| **Typography weight** | Render a known-text sample in a hidden probe element; compare char width histogram to baseline |
| **Status pulse frozen** | Confirm reduced-motion disabled animation (no frame-to-frame delta in a 3-frame capture) |

All attribute checks have named IDs (`border-color`, `corner-ticks`, …) and appear in the failure report individually, so the fix loop knows exactly what drifted.

### 5.3 Report format

Per section, produce `visual-report/<id>.json`:

```json
{
  "id": "alarm-stats",
  "pass": false,
  "metrics": {
    "pixelMismatchRatio": 0.0187,
    "perceptualDelta": 2.4
  },
  "attributeChecks": [
    { "name": "border-color",   "pass": true },
    { "name": "corner-ticks",   "pass": false, "expected": "#6EE7F9", "observed": "#C9D4DE" },
    { "name": "label-strip",    "pass": true },
    { "name": "accent-underline","pass": true }
  ],
  "diffImage": "visual-report/alarm-stats.diff.png"
}
```

The `diffImage` is a 3-panel composite: `[baseline | actual | highlighted-diff]`.

---

## 6. Tolerance Policy

"Almost pixel perfect" means strict defaults with narrow, documented escapes:

| Metric | Default threshold | Escape |
|---|---|---|
| `pixelMismatchRatio` (pixelmatch) | ≤ **0.5 %** | Per-region override in `tolerances.json` with a written reason |
| `perceptualDelta` (resemblejs) | ≤ **1.5** | Same |
| `attributeChecks.pass` | 100 % must pass | No escape — attribute checks are hard gates |
| Antialiasing tolerance | `threshold: 0.1` in pixelmatch | Fixed |

Regions that legitimately vary (chart lines, Model Render) use a **masked diff**: a PNG mask (`visual-masks/<id>.png`) zeroes the volatile area before pixel comparison. The mask itself is reviewed the way code is.

---

## 7. Failure Handling & Fix Loop

Integrates with the existing orchestrator fix loop (`src/orchestrator/`).

### 7.1 On fail

1. The visual validator writes a **structured failure context** to the task's error channel:
   ```
   visual-drift: alarm-stats
     pixelMismatchRatio: 0.0187 (threshold 0.005)
     failed-attributes: corner-ticks (expected #6EE7F9, observed #C9D4DE)
     diff-image: <path>
   ```
2. The attached diff image is base64-encoded into the next codegen prompt (provider permitting).
3. A `visual-feedback.md` fragment is rendered with the failure details (per the §8 Prompts rule — no inline strings) and included in the fix-loop user prompt.
4. Max iterations per component follows the existing `--iterations` flag (default 5).

### 7.2 Escalation

If a section fails 3 consecutive fix iterations:

- Save the entire artifact bundle to `.workspace/<runId>/visual-failures/<id>/`.
- Mark the run as **needs-human-review** (not a hard error).
- Continue validating other sections — one stuck section does not block the whole run.

### 7.3 Non-visual failures take precedence

Type-check errors and build errors block visual validation entirely — there's no point diffing a broken app. Visual validation only runs against a successful build.

---

## 8. Artifacts

Per generator run, under `.workspace/<runId>/`:

```
visual-baselines/          # checked-in upstream; copied here for the run
  alarm-stats.png
  alarm-stats.online.png
  ...
visual-actual/             # Playwright output
  alarm-stats.png
  ...
visual-report/
  manifest.json
  alarm-stats.json
  alarm-stats.diff.png
  ...
visual-masks/              # committed upstream; copied here
  model-render.png         # masks the spinning point cloud
  health-monitor.png       # masks the chart line
```

The `visual-report/manifest.json` is the single file CI reads to decide pass/fail.

---

## 9. Tooling

| Purpose | Dependency | Notes |
|---|---|---|
| Browser driving | `playwright` | Chromium only — deterministic across OSes |
| Pixel diff | `pixelmatch` | MIT, zero-dep, well-tuned |
| Perceptual diff | `resemblejs` or `odiff-bin` | Pick one; `odiff` is faster on large PNGs |
| PNG handling | `pngjs` | Already pulled in by pixelmatch |
| Color sampling | hand-written — small | Avoid heavy image libs |

All installed via `bun add` per project convention. No network access during capture/diff.

---

## 10. CI Integration

1. GitHub Actions job `visual` runs after `build` succeeds.
2. Steps:
   - Start the Angular app in preview mode.
   - Run `bun run validate:visual` → produces `visual-report/manifest.json`.
   - Upload `visual-report/**` as an artifact on failure (always attach diff PNGs).
   - Fail the job if any non-escalated section fails.
3. A PR comment is posted with a table of sections and `PASS / FAIL (ratio)` so reviewers see the result without downloading the artifact.

---

## 11. Out of Scope

- Cross-browser visual parity (Chromium only for now).
- Responsive diffs at other viewport widths (desktop-first; design reference is 1820×920).
- LIGHT theme diffs — DARK is the reference; LIGHT is verified by a separate, looser suite.
- Animation / motion validation beyond "frozen under reduced-motion."
