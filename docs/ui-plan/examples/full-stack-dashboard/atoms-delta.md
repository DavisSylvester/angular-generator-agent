# Atoms Delta — Full Stack Developer Dashboard

> Atoms proposed by this example for possible promotion into the pattern catalogue at [`../../01-panel-interface.md`](../../01-panel-interface.md) §6.
> Per [`../../02-decomposition-process.md`](../../02-decomposition-process.md) §8, each proposal is reviewed before implementation starts. Accepted items are moved into the pattern docs and removed from this file.

Status legend: `proposed` · `accepted` · `rejected` · `deferred`.

---

## NodeCell — `proposed`

- **Purpose:** single cell in a heat-map / node-grid visualization.
- **Inputs:** `state: 'empty' | 'active' | 'alarm'`, `size?: number`
- **DOM sketch:** `<span class="node-cell" data-state="…"></span>`
- **Rationale:** appears in ActiveNodes Panel. Generic enough to recur in any telemetry UI.
- **Notes:** likely promote as-is.

## ProgressBar — `proposed`

- **Purpose:** horizontal fill bar for bounded metrics (load, throughput).
- **Inputs:** `value: number`, `max: number`, `color?: 'accent' | 'warn' | 'crit'`
- **Rationale:** used in RuntimeMetrics header bars. Absent from pattern catalogue.
- **Notes:** likely promote.

## NavTab / FilterTab — `proposed` (pair)

- **Purpose:** uppercase labelled link with an active-state underline.
- **Inputs:** `label: string`, `active: boolean`, `href?: string`
- **Rationale:** AppHeader nav + ActiveNodes footer filters share the same visual shape. Consider unifying as `Tab` with a variant.
- **Notes:** deferred — decide on one `Tab` vs. two named atoms during tuning review.

## Dot — `proposed`

- **Purpose:** 8px colored dot used as a visual separator or series swatch (LoadBar, ThreBar).
- **Inputs:** `color: string` (token reference)
- **Rationale:** trivially small; might be inlined as a styled `<span>` rather than a component.
- **Notes:** deferred — evaluate inline-vs-component tradeoff.

## Tag — `proposed`

- **Purpose:** section marker pill (e.g. "SAMPLE ANALYSIS").
- **Inputs:** `text: string`, `tone?: 'accent' | 'muted'`
- **Rationale:** distinct from `Chip` (which is inline alongside data). Tag is a section label.
- **Notes:** may collapse into `Chip` with a `tone="section"` variant.

## AccentRule — `accepted`

- **Purpose:** full-width 2px accent bar under a Panel footer or nav group.
- **Inputs:** `color?: PanelStatus`, `variant?: 'solid' | 'gradient'`
- **Rationale:** recurring motif for nav underlines and the AppHeader gradient.
- **Notes:** accepted — but NOT valid for the AlarmStats sub-Panel footers, which are segmented indicators (see `ActivityIndicator`). See KB §1.

## ActivityIndicator — `accepted`

- **Purpose:** N-segment horizontal tick group; first M segments filled, remaining (N−M) outlined. Conveys a fractional or binary-coded state.
- **Inputs:** `total: number` (default 4), `active: number`, `status: PanelStatus`, `segmentWidth?` (default `var(--sp-3)`), `segmentGap?` (default `var(--sp-1)`).
- **DOM sketch:** `<div class="pm-indicator"><span class="pm-indicator__seg pm-indicator__seg--on"></span>...<span class="pm-indicator__seg pm-indicator__seg--off"></span>...</div>`
- **Rationale:** required by the AlarmStats sub-Panel footers in the reference. See KB §1.
- **Notes:** promote into pattern catalogue at `01-panel-interface.md` §6.

---

## Proposals rejected

*(none yet)*

---

## Proposals deferred

See individual entries above marked `deferred`.
