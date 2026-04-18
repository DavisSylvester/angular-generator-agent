# Panel Model UI

Reference Angular 19 workspace implementing the **Panel Model Pattern** from `../docs/ui-plan/`.

This is the pattern's home — one Angular app that demonstrates every primitive and validates every atomic leaf against the tuning example at `../docs/ui-plan/examples/full-stack-dashboard/`.

## Structure

```
ui/
├── src/
│   ├── styles/
│   │   ├── tokens/        # contract-level CSS custom property names
│   │   ├── themes/        # concrete values (dark, …)
│   │   ├── mixins/        # corner-ticks, label-strip, kv-row, pulse, stat-hero
│   │   ├── base/          # reset, typography, a11y
│   │   └── styles.scss    # entry
│   └── app/
│       ├── panel/         # PanelComponent + slots + types — the pattern core
│       ├── atoms/         # atomic leaves (stat, …)
│       └── atoms-preview/ # /atoms route — renders every atom + variant
```

## Scripts

```bash
bun install        # first time
bun run start      # ng serve on http://localhost:4200
bun run build      # production build into dist/
```

## Pattern hooks

- All Panels accept a `visualId` input that emits as `data-visual-id` on the host — wired up for Stage B visual validation (`tests/visual/after.spec.mts`).
- Tokens resolve by CSS variable name only; `[data-theme]` on `<html>` swaps the active palette. Default is `dark`.
- `prefers-reduced-motion: reduce` collapses all motion token durations to 0ms.

## Status

- [x] Tokens & theme
- [x] Panel + slot components
- [x] Mixins (corner-ticks, label-strip, kv-row, pulse, stat-hero, chart-surface)
- [x] Stat atom
- [x] /atoms preview route
- [ ] KvRow, SparkLine, LiveChip, Chip, Tag, Icon, IconButton, Dot, AccentRule, ProgressBar, NodeCell, FilterTab, NavTab atoms
- [ ] Feature Panels (AlarmStats, RuntimeMetrics, HealthMonitor, ActiveNodes, AlarmList, ModelRender)
- [ ] AppHeader + DashboardPage layout
- [ ] Deterministic mock fixture
- [ ] Playwright after-capture spec + diff
