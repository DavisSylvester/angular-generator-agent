# UI Plan — The Panel Model Pattern

> A reusable pattern for decomposing any UI reference into a recursive 5-slot Panel tree, implementing it in Angular, and validating the implementation against the reference visually.
>
> **This document is the pattern, not a project.** It is reference-agnostic. Concrete references (screenshots, Figma exports) live under [`examples/`](examples/) and feed fine-tuning back into this pattern per [`02-decomposition-process.md`](02-decomposition-process.md) §8.
>
> **No implementation begins on any example until the pattern is approved and the example's decomposition is authored.**

---

## Table of Contents

1. [Overview](#1-overview)
2. [Style Guide](#2-style-guide)
3. [HTML Structure](#3-html-structure)
4. [SCSS Architecture](#4-scss-architecture)
5. [JavaScript / Angular](#5-javascript--angular)
6. [Photos](#6-photos)
7. [Video / Motion](#7-video--motion)
8. [Prompts & System Files](#8-prompts--system-files)
9. [Visual Validation](#9-visual-validation)
10. [Deliverables](#10-deliverables)
11. [Out of Scope](#11-out-of-scope)

---

## 1. Overview

Every UI surface decomposes into the same 5-slot **Panel**:

| Slot | Role |
|---|---|
| **Frame** | Outer chrome — border, corner ticks, label strip |
| **Header** | Title + meta (ID, status chip, live indicator, tab controls) |
| **Body** | Primary payload — chart, grid, list, or child Panels |
| **Footer** | Secondary telemetry (timestamps, source, version) |
| **Status** | Ambient state projected onto Frame (color, pulse, badge) |

A Panel is **atomic** when its Body is a primitive (number, sparkline, label+value) rather than more Panels. Decomposition terminates at atomics.

Full component contract → [`01-panel-interface.md`](01-panel-interface.md)
How to decompose any reference → [`02-decomposition-process.md`](02-decomposition-process.md)
Visual validation pipeline → [`03-visual-validation.md`](03-visual-validation.md)
First tuning example → [`examples/full-stack-dashboard/`](examples/full-stack-dashboard/)

### 1.1 How the pattern evolves

The pattern is proven by how cleanly new references fit it, not by how thoroughly it was specified up front. Each example in [`examples/`](examples/) produces:

- A decomposition tree (applies the pattern)
- An atoms delta (proposes new atomic leaves)
- Tuning notes (proposes changes to the pattern itself)

Accepted deltas and notes become PRs against this doc and its siblings. The pattern refines; examples accumulate.

---

## 2. Style Guide

The pattern owns **token groups and their meanings**, not specific values. Every example supplies concrete values in its own `tokens.scss` override that targets these token names.

### 2.1 Token groups (contract)

All visual values — colors, spacing, typography, motion — resolve through CSS custom properties under `:root`. Components consume `var(--*)`; they never hold literals.

| Token group | Names the pattern defines | What each example must supply |
|---|---|---|
| **Color — base** | `--bg-0` (page), `--bg-1` (panel), `--bg-2` (inset), `--line`, `--line-dim` | Concrete hex per theme |
| **Color — text** | `--fg-0`, `--fg-1` (label), `--fg-2` (muted), `--fg-accent` | Concrete hex per theme |
| **Color — state** | `--ok`, `--warn`, `--crit`, `--live`, `--info` | Concrete hex per theme |
| **Color — series** | `--series-1` … `--series-N` | A deterministic chart palette |
| **Space** | `--sp-1` … `--sp-6` | Pixel values following a consistent step |
| **Radius** | `--r-0`, `--r-1` | A "sharp" and a "default" radius |
| **Border** | `--bw-hair`, `--bw-accent` | Hairline and accent widths |
| **Typography** | `--font-mono`, `--font-sans` | One mono, one sans family |
| **Type scale** | `--t-xs` … `--t-xxl` | At least 6 steps; `--t-xxl` is the hero stat |
| **Motion** | `--dur-fast`, `--dur-med`, `--dur-slow`, `--easing` | Durations + one shared easing |

### 2.2 Theme contract

- At least one theme must be defined. A second (typically a light/dark counterpart) is optional.
- Theme is activated by a `data-theme="<name>"` attribute on `<html>`.
- Swapping theme is a pure variable swap — no structural changes, no per-theme CSS overrides outside the token file.
- Visual hierarchy (border weight, corner-tick presence, accent positioning) is theme-invariant.

### 2.3 Visual motifs the pattern guarantees

These motifs are contracts the pattern enforces; examples may **tune their values** (size, opacity, weight) but must not remove them:

- **Corner ticks** on every `variant="default"` Frame. Rendered via `::before` / `::after`, not SVG.
- **Header/Body separator** as a horizontal rule (style is example-chosen: solid, dotted, gradient).
- **Label strip** hovering at the Frame's top-left when `label` input is set.
- **Accent underline** available on `<pm-footer [accent]>` and active nav tabs.
- **Monospace** for all numeric and short-label text; sans reserved for multi-line prose.
- **Uppercase small labels** for KV keys and section markers (tracking ≥ `+0.04em`).
- **Sharp corners** — `--r-1` must be ≤ 4px.

### 2.4 Iconography

- Line-art SVG, stroke-based, sized to adjacent line-height.
- Icon color inherits `currentColor` so status drives color without stylesheet swaps.
- Icon names are registered in a per-example registry; the pattern does not prescribe which glyphs exist.

---

## 3. HTML Structure

### 3.1 Slot projection

A Panel is declared once in markup with named content-projection slots:

```html
<pm-panel status="ok">
  <pm-header>…</pm-header>
  <pm-body>…</pm-body>
  <pm-footer>…</pm-footer>
</pm-panel>
```

- Slots are **optional** — omit Header for borderless leaf Panels.
- Frame and Status are not authored — they are rendered by the Panel host.
- Nested Panels are just Panels inside `<pm-body>` — no special syntax.

### 3.2 Semantic HTML mapping

| Panel role | Host element | Notes |
|---|---|---|
| Page root | `<main>` | One per route |
| Section group (dashboard) | `<section>` | Labelled via `aria-labelledby` |
| Panel | `<article>` | Or `<section>` when labelled |
| Header | `<header>` | Inside article |
| Body | `<div role="region">` or `<figure>` for charts | |
| Footer | `<footer>` | |
| Atomic stat | `<dl><dt><dd>` | Key/value dictionary semantics |
| Alarm list | `<ul role="list">` of `<li>` | |
| Node grid | `<table role="grid">` or `<div role="grid">` | |

### 3.3 Accessibility contract

- Every Panel with a Header must have the Header's title `id` referenced by the Panel's `aria-labelledby`.
- Status is announced via `aria-live="polite"` on the Panel when Status transitions (LIVE FEED, alarm severity change).
- Numeric stats expose both the raw value and unit via `aria-label`: e.g. `aria-label="core temp average 162.56 fahrenheit"`.
- All interactive controls reachable via keyboard; focus ring uses `--fg-accent` at 2px offset.

---

## 4. SCSS Architecture

### 4.1 Directory layout

```
styles/
├── tokens/
│   ├── _color.scss       # DARK + LIGHT palette maps
│   ├── _space.scss
│   ├── _type.scss
│   ├── _motion.scss
│   └── _index.scss       # forwards all tokens
├── base/
│   ├── _reset.scss
│   ├── _typography.scss
│   └── _a11y.scss        # focus rings, sr-only
├── mixins/
│   ├── _panel.scss       # corner-ticks, frame, label-strip
│   ├── _chart.scss       # axis, gridline
│   └── _kv.scss          # key-value row layout
├── themes/
│   ├── _dark.scss
│   └── _light.scss
└── styles.scss            # entrypoint
```

### 4.2 Rules

- **No component .scss imports tokens directly** — tokens are emitted as CSS variables under `:root`, then consumed by `var(--*)`.
- **Mixins are the only way** to render corner ticks, label strips, and frame borders — no component reimplements them.
- **One SCSS file per component**, co-located with its `.ts` and `.html` (Angular standard from project CLAUDE.md).
- **BEM-lite naming** inside a component: `.panel`, `.panel__header`, `.panel--live`. Class names are component-scoped by Angular view-encapsulation so collisions are not a concern.
- **No nesting deeper than 3 levels.**
- **No `!important`** outside of accessibility overrides.

### 4.3 Key mixins (contract, not implementation)

```scss
@mixin pm-frame($status: 'default');        // border, corner ticks, label strip positioning
@mixin pm-label-strip($text);               // top-left UPPERCASE label
@mixin pm-kv-row;                            // 2-col grid, label left / value right
@mixin pm-chart-surface;                     // inset bg, dotted grid
@mixin pm-stat-hero;                         // XXL mono numeral with denominator
@mixin pm-pulse($color);                     // infinite opacity pulse for LIVE FEED dot
```

### 4.4 Layout

- **Page**: CSS Grid, 12-column, gutter resolves from `--sp-*` token.
- **Section bodies**: CSS Grid for 2D arrangements, Flexbox for linear ones. The pattern does not prescribe specific column counts — examples declare their own grid.
- **Panel body internal**: Flexbox when linear, Grid when tabular.
- **No fixed widths at Panel level** — Panels fill their grid cell.

---

## 5. JavaScript / Angular

### 5.1 Framework conventions

Per project CLAUDE.md standards:

- Standalone components only (no NgModules).
- Separate `.ts`, `.html`, `.scss` files.
- `inject()` function, not constructor injection.
- `OnPush` change detection.
- Signals for state, RxJS only at HTTP boundaries.
- Strict TypeScript, no `any`.

### 5.2 Core primitives

| Symbol | Kind | Purpose |
|---|---|---|
| `PanelComponent` | standalone component | Renders Frame + Status, projects Header/Body/Footer slots |
| `PanelHeaderComponent` | standalone component | Label strip, title, meta, controls slot |
| `PanelBodyComponent` | standalone component | Content region, applies inset background |
| `PanelFooterComponent` | standalone component | Telemetry row |
| `PanelStatus` | discriminated union type | `'ok' \| 'warn' \| 'crit' \| 'live' \| 'idle'` |
| `StatComponent` | atomic leaf | Hero numeral + denominator + unit |
| `KvRowComponent` | atomic leaf | Label/value/unit tuple |
| `SparkLineComponent` | atomic leaf | Inline mini-chart |
| `LiveChipComponent` | atomic leaf | Pulsing dot + text |

Full contract → [`01-panel-interface.md`](01-panel-interface.md).

### 5.3 Data flow

- Each Panel component receives an `input()` signal of its typed model.
- No Panel fetches its own data. A route-level container orchestrates HTTP via services, then passes models down.
- Live-updating Panels (HealthMonitor, RuntimeMetrics) subscribe to an observable from a service; component maps to signals via `toSignal()`.

### 5.4 Project layout (pattern shape — example names may vary)

```
app/
├── panel/        # Panel primitives (host, slots, mixins) — pattern-level
├── atoms/        # Catalogue atoms — pattern-level
├── features/     # One folder per Panel in the example's decomposition tree
├── layout/       # Page shell + navigation — example-level
├── services/     # Data sources — example-level
└── models/       # Typed interfaces, one per file (per CLAUDE.md)
```

Folder names under `features/`, `layout/`, and `services/` derive 1:1 from the example's decomposition; the pattern does not prescribe them.

### 5.5 Testing contract

- **Unit** — each atomic leaf has a render test asserting slot projection and status class.
- **Integration** — `PanelComponent` with all three slots; status transition (`ok → warn → crit`) asserts `aria-live` behavior.
- **Visual** — Playwright per-section before/after diff per [`03-visual-validation.md`](03-visual-validation.md). Every example must pass this stage for every Panel in its decomposition.

---

## 6. Photos

The pattern does not dictate which images an example needs — those derive from its decomposition. The pattern dictates **format, storage, and fallback rules**.

### 6.1 Asset classes the pattern recognizes

| Class | When to use | Format preference |
|---|---|---|
| **Brand / logos** | App header, splash | SVG |
| **Line-art iconography** | Any icon in the atom catalogue | Inline SVG via a registry |
| **Illustrations** (empty states, error states) | Zero-data regions | SVG |
| **High-fidelity raster fallbacks** | When a WebGL / Canvas surface must degrade | PNG @1× and @2× |
| **Photographic content** | Rare; content-driven examples only | PNG or WebP — never JPEG for UI chrome |

### 6.2 Format rules (apply to every example)

- Prefer **SVG** for any geometric / line-art asset.
- Use **PNG @1× and @2×** only when a raster is unavoidable.
- SVGs stripped of metadata, optimized with SVGO, ideally under 4 KB.
- Theme variants produced via `currentColor` or CSS filters — never two separate files.
- Every interactive canvas/WebGL surface must declare a static fallback image for reduced-motion and for visual validation capture.

### 6.3 Storage layout

```
src/assets/
├── brand/
├── icons/         # Inline SVGs, rendered via a registry component
├── renders/       # Raster fallbacks for canvas/WebGL surfaces
└── empty-states/
```

---

## 7. Video / Motion

The pattern treats motion as a property of specific atoms and Panels, not a cross-cutting concern. No MP4 / video-element content ships by default — motion is CSS animation, SVG animation, or canvas/WebGL driven.

### 7.1 Motion archetypes the pattern recognizes

| Archetype | Where it applies | Mechanism |
|---|---|---|
| **Pulse** | `LiveChip` and any atom with `status="live"` | CSS `@keyframes`, reduced-motion guarded |
| **Streaming chart** | Line/area charts receiving continuous samples | Chart library's native streaming API |
| **Value tween** | Bars / progress / counters changing value | CSS `transition` on the relevant property |
| **State flash** | Cells / rows whose state just changed | Short `@keyframes` applied via Angular `[@.enter]` |
| **Shared-element** | Nav underline / active-tab marker across route changes | `@angular/animations` |
| **Crossfade** | Theme toggle, panel refresh | CSS `transition` on the affected properties |
| **Canvas surface** | Hero visualisations | WebGL / Canvas2D inside a Panel body; falls back to static PNG |

Examples wire these archetypes to specific atoms; the pattern does not enumerate every use site.

### 7.2 Global rules

- **Respect `prefers-reduced-motion: reduce`** — non-essential motion disabled. Pulses become solid; tweens become instant; chart data still updates but without interpolation.
- **No motion longer than 600ms** for UI affordances.
- **No autoplay video elements.**
- Every canvas/WebGL surface exposes a pause control **and** a static fallback image.
- Motion durations resolve from `--dur-*` tokens; no hard-coded ms values.

### 7.3 Canvas / WebGL constraints

- Lazy-loaded chunk — initializes only when its host Panel enters the viewport.
- Target 60 FPS on integrated graphics; if frame-time exceeds 25ms for > 1s, degrade (Canvas2D → static image).
- External CDNs forbidden; bundle dependencies via `bun add`.

---

## 8. Prompts & System Files

**Hard rule:** no prompt text, system message, or instruction block may live as a string literal inside a source file. All such content lives in `.md` files and is injected at runtime.

### 8.1 Scope

This rule applies to **every** kind of AI/LLM-adjacent text this project (or its generated UI) might use:

- Agent system prompts (planning, codegen, validation, design selection).
- User-prompt templates and few-shot exemplars.
- Role descriptions, tool-use instructions, and safety preambles.
- Any multi-paragraph instructional text consumed by a model or shown to a user verbatim.

### 8.2 Layout

```
prompts/
├── agents/
│   ├── codegen.system.md
│   ├── planning.system.md
│   ├── design-selection.system.md
│   └── component-library.system.md
├── templates/
│   ├── codegen.user.md           # with {{placeholders}}
│   └── fix-loop.user.md
└── shared/
    └── angular-standards.md       # @included from other prompts
```

- One prompt per file, markdown only.
- Filename pattern: `<name>.<role>.md` where `<role>` ∈ {`system`, `user`, `assistant`, `fragment`}.
- Placeholders use `{{snake_case}}` and are documented in a short frontmatter block.
- Includes use a simple `@include shared/angular-standards.md` directive resolved by the loader.

### 8.3 Loader contract (Angular generator agent)

A single typed loader is the only way source code obtains a prompt:

```ts
// pseudo-contract — implementation deferred
interface PromptLoader {
  load(id: PromptId): Promise<PromptTemplate>;           // reads .md, resolves @includes
  render(id: PromptId, vars: Record<string, string>): Promise<string>;  // substitutes {{vars}}
}
```

- Source code imports `PromptId` enum values (e.g. `PromptId.CodegenSystem`), never raw paths or strings.
- Prompts are loaded from disk at startup and cached; no fetch-per-call.
- Missing placeholders or missing files fail **loudly** at load time, not at render time.

### 8.4 Refactor of existing prompts (follow-up task)

Current `src/prompts/*.mts` files hold prompts as template literals. These are out of compliance with this rule and will be migrated in a dedicated task *after* the UI plan is approved:

- Extract each `export const *_PROMPT` literal into its matching `.md` file under `prompts/`.
- Replace the export with a `PromptId` constant.
- Route all call sites through `PromptLoader.render()`.
- Verify via a unit test that no `.mts` file under `src/` contains a multi-line template literal longer than 10 lines that isn't a code fixture.

### 8.5 Enforcement

- ESLint rule (custom or `no-restricted-syntax`) flags any `TemplateLiteral` > N lines in files under `src/prompts/**` and `src/agents/**`.
- CI grep guard: `rg -n '^\`\`\`|^##|^You are' src --type ts` returns non-zero → fail build.
- PR checklist item: "Any prompt changes are in `.md` files only."

---

## 9. Visual Validation

**The universal workflow is [`04-per-element-workflow.md`](04-per-element-workflow.md).** Every page, every feature Panel, every atom goes through it — no exceptions. The workflow includes first-run KB preflight so an LLM with the KB loaded can converge in 1–3 iterations on motifs already covered.

**Hard rule (process):** after every component or element is created or modified, the full Stage A + Stage B + Stage C validation must run via `bun run scripts/verify.mts <example-id>`. Eyeballing a captured PNG is **not** validation. Stage C must produce a pass row in the report before the work is called done. See KB §3 — `docs/knowledge-bases/panel-model-fidelity-corrections.md`.

**Hard rule (output):** no component is marked complete until its rendered output matches the per-section "before picture" cropped from the reference design, within a strict tolerance on color, typography, spacing, borders, corner ticks, and iconography.

Full spec → [`03-visual-validation.md`](03-visual-validation.md).

### 9.1 Three-stage flow per section

| Stage | When | What |
|---|---|---|
| **A — Before Capture** | Once per reference update (not per run) | Playwright script loads `reference.png`, clips each region defined in `reference-regions.json`, writes PNGs + sha256 manifest to `/visual-baselines`. Committed to git. |
| **B — After Capture** | After the Angular app builds successfully | Playwright locates each Panel by `data-visual-id` on a deterministic `/analysis` + `/atoms` route with mocked data and `prefers-reduced-motion: reduce`, screenshots at the baseline's pixel dimensions. |
| **C — Diff & Validate** | Immediately after B | Pixel diff (`pixelmatch`) + perceptual diff (`resemblejs`/`odiff`) + named attribute checks (border color, corner-tick presence, label-strip color, accent underline, background, typography weight). Per-section JSON + 3-panel diff PNG written. |

### 9.2 Defaults

- `pixelMismatchRatio` ≤ **10 %** (hard pass line, enforced by `scripts/verify.mts`)
- `perceptualDelta` ≤ 1.5
- Attribute checks: **100 % must pass** — no escape.
- Volatile regions (chart line, Model Render canvas) use committed PNG masks.

### 9.3 Integration with fix loop

On failure, a structured `visual-drift` report + the diff image are fed back into the codegen fix loop via a `prompts/fragments/visual-feedback.md` template (per §8 — no inline strings). Max iterations inherits the existing `--iterations` flag. A section that fails 3 consecutive iterations is quarantined with full artifacts and flagged `needs-human-review`; the run continues on the remaining sections.

### 9.4 Required scaffolding (pattern-level, reused across examples)

- `scripts/capture-before.mts` — one-time baseline cropper; reads `examples/<id>/regions.json`.
- `tests/visual/after.spec.mts` — per-section screenshot + diff; parametrized by example id.
- Per example: `examples/<id>/reference.png` + `regions.json` + optional `masks/`.
- `visual-baselines/<example-id>/` — committed to git.
- ESLint rule requiring every named Panel to expose `data-visual-id`.

---

## 10. Deliverables

The pattern produces one set of pattern-level deliverables plus one set of per-example deliverables. Both are ordered so that dependencies resolve cleanly.

### 10.1 Pattern-level (built once)

1. **Design tokens & theme contract** — `styles/tokens/*` with named variables. Default values ship with the pattern; examples override.
2. **Panel primitives** — `PanelComponent`, slot components, mixins, corner ticks. Every Panel wires `data-visual-id`.
3. **Atomic leaf catalogue** — initial atoms from [`01-panel-interface.md`](01-panel-interface.md) §6. Grows as examples promote new atoms.
4. **Visual validation tooling** — before/after capture scripts, diff runner, attribute checks, fix-loop integration.
5. **ESLint rules** — `data-visual-id` required on Panel host elements; no multi-line template literals in `src/prompts/**` per §8.
6. **Prompt loader + `prompts/` scaffolding** — per §8.

### 10.2 Per-example (repeated for each reference)

1. `examples/<id>/reference.png` committed.
2. `examples/<id>/decomposition.md` authored (applying [`02-decomposition-process.md`](02-decomposition-process.md)).
3. `examples/<id>/regions.json` authored.
4. `examples/<id>/atoms-delta.md` + `tuning-notes.md` opened; any accepted items promoted to the pattern before codegen starts.
5. Before Capture run → `visual-baselines/<id>/*.png` committed.
6. Feature Panels implemented in the order declared by the example's decomposition.
7. Layout (shell, nav, routes) per the example's needs.
8. Deterministic mock fixture for the example.
9. Stage B + C visual validation passes for every Panel.
10. Per-example preview route(s) if the decomposition needs them (e.g. `/atoms`, `/<feature>`).

---

## 11. Out of Scope

Pattern-level:

- Cross-browser visual parity (Chromium only).
- Mobile / small-viewport layouts — responsive behavior is per-example.
- Real backend services — examples ship with mock fixtures.

Per-example scope is declared in that example's `README.md`.

---

**Approval gate:** user signs off on
- §2 token groups (pattern contract),
- §5 component inventory (pattern primitives + atoms),
- §9 visual-validation thresholds,
- §10.1 pattern-level deliverable order,
- the decomposition in the current example (`examples/full-stack-dashboard/decomposition.md`),
- any items in that example's `atoms-delta.md` that will be promoted before coding starts.

Only after all six are signed off does any file in `src/app/` get written.
