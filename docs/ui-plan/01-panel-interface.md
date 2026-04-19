# Panel Interface — Angular Contract

> Formal spec for the Panel primitive and slot directives — **pattern-level and reference-agnostic**.
> This is a **specification**, not implementation. Every example under [`examples/`](examples/) implements against this exact contract. New atomic leaves that an example proposes land in that example's `atoms-delta.md` first and are promoted into this doc only after review (see [`02-decomposition-process.md`](02-decomposition-process.md) §8).
> Code is generated after [`00-plan.md`](00-plan.md) is approved.

---

## Table of Contents

1. [Goals](#1-goals)
2. [Slot Model](#2-slot-model)
3. [Types](#3-types)
4. [PanelComponent](#4-panelcomponent)
5. [Slot Components](#5-slot-components)
6. [Atomic Leaves](#6-atomic-leaves)
7. [Composition Examples](#7-composition-examples)
8. [Accessibility](#8-accessibility)
9. [Testing Contract](#9-testing-contract)

---

## 1. Goals

- Every UI surface — from page root to a single stat tile — is a **Panel** with the same 5-slot contract.
- Composition via content projection; no configuration objects, no schema-driven rendering.
- Nested Panels require no special syntax — a Panel inside `<pm-body>` is just markup.
- Styling (Frame chrome, corner ticks, label strip, status color) is applied by the Panel host; feature code never re-implements it.
- Strict TypeScript, signals-first, OnPush throughout.

---

## 2. Slot Model

```
┌─ Frame (host) ────────────────────── Status (projected onto Frame) ─┐
│  ┌─ Header (optional) ──────────────────────────────────────────┐   │
│  │  label-strip · title · meta · controls                       │   │
│  └──────────────────────────────────────────────────────────────┘   │
│  ┌─ Body (required) ────────────────────────────────────────────┐   │
│  │  primitive | nested Panels | chart | grid | list             │   │
│  └──────────────────────────────────────────────────────────────┘   │
│  ┌─ Footer (optional) ──────────────────────────────────────────┐   │
│  │  timestamps · source · version · accent-underline            │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

| Slot | Authored? | Rendered by |
|---|---|---|
| Frame | no | `PanelComponent` host |
| Header | optional | `<pm-header>` projection |
| Body | yes | `<pm-body>` projection |
| Footer | optional | `<pm-footer>` projection |
| Status | no (input) | `PanelComponent` host, via `[status]` input + class binding |

---

## 3. Types

> Each type lives in its own `.mts` file under `src/app/panel/types/`, re-exported from a barrel (per project CLAUDE.md "one type per file" rule).

```ts
// src/app/panel/types/panel-status.mts
export type PanelStatus = 'ok' | 'warn' | 'crit' | 'live' | 'idle';

// src/app/panel/types/panel-variant.mts
export type PanelVariant = 'default' | 'inset' | 'borderless';

// src/app/panel/types/panel-density.mts
export type PanelDensity = 'comfortable' | 'compact';

// src/app/panel/types/panel-meta.mts
export interface PanelMeta {
  readonly id?: string;
  readonly source?: string;
  readonly timestamp?: string;
  readonly version?: string;
}
```

---

## 4. PanelComponent

### 4.1 Selector & shape

- Selector: `pm-panel`
- Standalone, OnPush, `imports: [NgClass]`
- Separate `.ts`, `.html`, `.scss`

### 4.2 Inputs (signals)

| Input | Type | Default | Notes |
|---|---|---|---|
| `status` | `PanelStatus` | `'idle'` | Drives status color + `aria-live` behavior |
| `label` | `string \| undefined` | `undefined` | Optional label strip (small upper-case tag top-left of Frame). Rendered even when Header slot is empty. |
| `variant` | `PanelVariant` | `'default'` | `inset` = sunken body bg; `borderless` = no Frame chrome |
| `density` | `PanelDensity` | `'comfortable'` | Controls internal padding |
| `ariaLabelledBy` | `string \| undefined` | `undefined` | `id` of the Header title when present |

### 4.3 Outputs

None. Panels do not emit events. Interactive controls live inside slots and emit their own events.

### 4.4 Host bindings

- `[class.pm-panel]` always
- `[class.pm-panel--status-*]` from `status`
- `[class.pm-panel--variant-*]` from `variant`
- `[class.pm-panel--density-*]` from `density`
- `[attr.role]="'region'"` if `ariaLabelledBy` is set, else none
- `[attr.aria-labelledby]="ariaLabelledBy"`
- `[attr.aria-live]="status === 'live' ? 'polite' : null"`

### 4.5 Template sketch

```html
<!-- panel.component.html -->
@if (label()) {
  <span class="pm-panel__label">{{ label() }}</span>
}
<ng-content select="pm-header" />
<ng-content select="pm-body" />
<ng-content select="pm-footer" />
<span class="pm-panel__tick pm-panel__tick--tl" aria-hidden="true"></span>
<span class="pm-panel__tick pm-panel__tick--tr" aria-hidden="true"></span>
<span class="pm-panel__tick pm-panel__tick--bl" aria-hidden="true"></span>
<span class="pm-panel__tick pm-panel__tick--br" aria-hidden="true"></span>
```

---

## 5. Slot Components

All three are tiny standalone components whose only job is to namespace projection and apply their own layout class.

### 5.1 `PanelHeaderComponent`

- Selector: `pm-header`
- Projects free content.
- Expects (by convention, not enforced): title element with an `id`, optional `.pm-header__meta` and `.pm-header__controls` siblings.

### 5.2 `PanelBodyComponent`

- Selector: `pm-body`
- Applies inset background when parent Panel `variant === 'inset'` (via CSS `:host-context`).
- Accepts any content including nested `<pm-panel>`.

### 5.3 `PanelFooterComponent`

- Selector: `pm-footer`
- Renders a top border (dotted) separating footer from body.
- Accepts optional `[accent]` boolean input → renders the 2px cyan accent bar.

---

## 6. Atomic Leaves

Atomic leaves are the terminal Panels — their Body is a primitive, not more Panels.

### 6.1 `StatComponent`

Hero numeral with denominator + unit + optional label.

| Input | Type | Notes |
|---|---|---|
| `value` | `number` | Required |
| `denominator` | `number \| undefined` | When set, renders as `value / denominator` |
| `unit` | `string \| undefined` | e.g. `'%'`, `'mw'`, `'°F'` |
| `label` | `string \| undefined` | Uppercase small label below numeral |
| `status` | `PanelStatus` | Drives numeral color |

### 6.2 `KvRowComponent`

A single key/value/unit tuple in a 2-column grid. Used inside RuntimeMetrics and elsewhere.

| Input | Type | Notes |
|---|---|---|
| `k` | `string` | Uppercase key — rendered left |
| `v` | `string \| number` | Value — rendered right |
| `unit` | `string \| undefined` | Rendered after value in muted color |
| `emphasis` | `'normal' \| 'warn' \| 'crit'` | Value color accent |

### 6.3 `SparkLineComponent`

Inline mini-chart for trend indicators.

| Input | Type | Notes |
|---|---|---|
| `data` | `readonly number[]` | Required |
| `height` | `number` | Default 24 |
| `status` | `PanelStatus` | Drives stroke color |

### 6.4 `ActivityIndicatorComponent`

N-segment horizontal tick group that conveys fractional or binary-coded state (e.g. "2 of 4 active"). Recorded in KB §1.

| Input | Type | Notes |
|---|---|---|
| `total` | `number` | Default 4 |
| `active` | `number` | 0..total; first `active` segments render filled |
| `status` | `PanelStatus` | Drives segment color (filled and outline both use status color) |
| `segmentWidth?` | `string` | CSS length. Default `var(--sp-3)` |
| `segmentGap?` | `string` | CSS length. Default `var(--sp-1)` |

### 6.5 `LiveChipComponent`

Pulsing dot + text — `LIVE FEED`, `OFFLINE`, `STALE`.

| Input | Type | Notes |
|---|---|---|
| `state` | `'live' \| 'stale' \| 'offline'` | Drives color + pulse |
| `label` | `string` | Default `'LIVE FEED'` |

### 6.5 `CornerTicksComponent`

Reusable 4-corner tick marks when a non-Panel element needs Panel chrome (rare).

---

## 7. Composition Examples

### 7.1 Simplest leaf — a Stat inside a Panel

```html
<pm-panel label="ONLINE" status="ok">
  <pm-body>
    <pm-stat [value]="102" [denominator]="109" label="ACTIVE / ALL"></pm-stat>
  </pm-body>
</pm-panel>
```

### 7.2 AlarmStats — a Panel containing 3 nested Panels

```html
<pm-panel label="ALARM STATS">
  <pm-header>
    <div class="pm-header__cols">
      <span>ONLINE</span><span>ALARMS</span><span>SLA</span>
    </div>
  </pm-header>
  <pm-body>
    <div class="alarm-stats__grid">
      <pm-panel variant="borderless"><pm-body>
        <pm-stat [value]="102" [denominator]="109" label="ACTIVE / ALL" status="ok" />
      </pm-body></pm-panel>

      <pm-panel variant="borderless"><pm-body>
        <pm-stat [value]="14" [denominator]="23" label="12H / 24H" status="warn" />
      </pm-body></pm-panel>

      <pm-panel variant="borderless"><pm-body>
        <pm-stat [value]="99.4" [denominator]="100" label="UPTIME / —" status="ok" />
      </pm-body></pm-panel>
    </div>
  </pm-body>
  <pm-footer [accent]="true" />
</pm-panel>
```

### 7.3 Health Monitor — Panel wrapping a chart

```html
<pm-panel label="HEALTH MONITOR" [ariaLabelledBy]="'hm-title'">
  <pm-header>
    <h3 id="hm-title" class="pm-header__title">HEALTH MONITOR</h3>
    <div class="pm-header__meta">
      <span>ID: 255212</span>
      <span>DATA_SET: POLARIS</span>
    </div>
    <div class="pm-header__controls">
      <pm-live-chip state="live" />
    </div>
  </pm-header>
  <pm-body>
    <app-health-chart [series]="series()" />
  </pm-body>
  <pm-footer>
    <span>SAMPLE HEALTH: OK</span>
    <span>CURRENT STREAM: {{ currentStream() }}</span>
  </pm-footer>
</pm-panel>
```

---

## 8. Accessibility

- Header title must have an `id`; parent Panel sets `[ariaLabelledBy]` to that `id`.
- `status="live"` sets `aria-live="polite"` on the Panel host.
- Numeric atoms (Stat, SparkLine) expose a combined `aria-label`: `"core temp average 162.56 fahrenheit"`.
- Focus ring uses `outline: 2px solid var(--fg-accent); outline-offset: 2px;` — never `outline: none`.
- Decorative chrome (corner ticks, label strip) is `aria-hidden="true"`.
- `prefers-reduced-motion: reduce` disables the LiveChip pulse and Panel status transitions.

---

## 9. Testing Contract

Each primitive has a co-located spec asserting:

| Primitive | Must assert |
|---|---|
| `PanelComponent` | Renders host class, projects all three slots, sets `aria-labelledby` when given, toggles `aria-live` for `status="live"` |
| `PanelComponent` — variants | `variant="inset"` adds inset class to `<pm-body>`, `variant="borderless"` removes Frame chrome |
| `PanelHeaderComponent` | Projects children; renders nothing when empty |
| `PanelFooterComponent` | Accent bar appears only when `[accent]="true"` |
| `StatComponent` | Renders numeral, separator, denominator; applies status class; exposes `aria-label` |
| `KvRowComponent` | 2-col grid; unit in muted span; emphasis colors |
| `SparkLineComponent` | Generates path for given data; height respected; status stroke applied |
| `LiveChipComponent` | Pulse animation class applied only when `state === 'live'` and reduced-motion off |

Integration test: mount AlarmStats and assert 3 child Panels each with a Stat, correct status classes, and a single accent footer on the parent.

Visual test (Playwright): full dashboard in DARK, screenshot-diff against baseline.
