# Decomposition Tree — Full Stack Developer Dashboard

> Exhaustive breakdown of this example's reference screenshot into Panels using the 5-slot Panel Model from [`../../00-plan.md`](../../00-plan.md), the interface spec in [`../../01-panel-interface.md`](../../01-panel-interface.md), and the process in [`../../02-decomposition-process.md`](../../02-decomposition-process.md).
>
> **This is an applied output, not the pattern.** Findings from this tree that should change the pattern itself live in [`tuning-notes.md`](tuning-notes.md); proposed new atoms live in [`atoms-delta.md`](atoms-delta.md).
>
> Every node is a Panel. Decomposition terminates at **atomic leaves** (Stat, KvRow, SparkLine, LiveChip, Icon, Chip, Label).

---

## Legend

```
■ Panel              (Frame ▸ Header ▸ Body ▸ Footer ▸ Status)
· slot content       (non-Panel authored content inside a slot)
★ atomic leaf         (terminal primitive)
↳ nested panel        (child Panel inside the parent's Body)
```

Format for each Panel:

```
■ PanelName    status=<ok|warn|crit|live|idle>    variant=<default|inset|borderless>
  Frame   : <chrome notes>
  Header  : <what lives in pm-header>
  Body    : <what lives in pm-body — may be nested Panels or atomics>
  Footer  : <what lives in pm-footer>
  Status  : <drives color / pulse>
```

---

## Top-Level Tree

```
■ Page (AppShell)
├── ■ AppHeader
├── ■ DashboardPage
│   ├── ■ TopRow (3 cols)
│   │   ├── ■ ModelRender
│   │   ├── ■ HealthMonitor
│   │   └── ■ RuntimeMetrics
│   └── ■ BottomRow (3 cols)
│       ├── ■ ActiveNodes
│       ├── ■ AlarmStats
│       └── ■ AlarmList
```

---

## 1. Page (AppShell)

```
■ Page                                       status=idle  variant=borderless
  Frame   : outer app border + global corner ticks (decorative)
  Header  : ↳ AppHeader
  Body    : ↳ DashboardPage
  Footer  : (none in reference)
  Status  : idle
```

---

## 2. AppHeader

```
■ AppHeader                                  status=idle  variant=default
  Frame   : bottom hairline divider
  Header  : · Brand (HexLogo + "FULL STACK DEVELOPER" + "SITE PROJECT: 771-C/3309-M2")
            · Nav (ANALYSIS [active] · ABOUT · SWITCH THEME (DARK))
  Body    : (none — header is the whole content)
  Footer  : · AccentRule (full-width 1px gradient)
  Status  : idle

  Atoms used:
  ★ HexLogo              (SVG)
  ★ BrandTitle           (label + subtitle KV pair)
  ★ NavTab × 3           (uppercase link + underline when active)
  ★ AccentRule           (full-width gradient bar)
```

---

## 3. DashboardPage

```
■ DashboardPage                              status=idle  variant=borderless
  Frame   : (no chrome — layout only)
  Header  : · Tag ("SAMPLE ANALYSIS" cyan pill, uppercase)
  Body    : · Grid(3 cols × 2 rows, gap=var(--sp-4))
              ↳ ModelRender         (row 1 col 1)
              ↳ HealthMonitor       (row 1 col 2)
              ↳ RuntimeMetrics      (row 1 col 3)
              ↳ ActiveNodes         (row 2 col 1)
              ↳ AlarmStats          (row 2 col 2)
              ↳ AlarmList           (row 2 col 3)
  Footer  : (none)
  Status  : idle

  Atoms used:
  ★ Tag                 (uppercase cyan-on-dark pill)
```

---

## 4. ModelRender

```
■ ModelRender                                status=live  variant=default
  Frame   : corner ticks, label strip "MODEL RENDER"
  Header  : · Title "MODEL RENDER"
            · Meta ("ID: 34-842" right-aligned)
  Body    : · ModelCanvas (WebGL point-cloud inside a circular guide ring)
            · OverlayKV (top-left)
                ★ KvRow "ID" "255212"
                ★ KvRow "DATA_SET" "POLARIS"
                ★ KvRow "UNIT_GROUP" "M22"
            · OverlayKV (top-right)
                ★ KvRow "—" "2023-02-28T20:27:00.285Z"
                ★ KvRow "—" "(UP TO DATE)"
  Footer  : · KvRow "UNIT_TESTS" "OK"
            · KvRow "FRAMER_MOTION 8.0.3-ALPHA.1" (right-aligned)
            · Chip "FPS: 32.77470378" (small mono, cyan)
  Status  : live (idle if reduced-motion)

  Atoms used:
  ★ ModelCanvas         (WebGL host — fallback PNG when reduced-motion)
  ★ KvRow × 7
  ★ Chip
```

---

## 5. HealthMonitor

```
■ HealthMonitor                              status=live  variant=default
  Frame   : corner ticks, label strip "HEALTH MONITOR"
  Header  : · Title "HEALTH MONITOR"
            · Meta
                ★ KvRow "ID" "255212"
                ★ KvRow "DATA_SET" "POLARIS"
            · Controls
                ★ IconButton (bars icon)
                ★ IconButton (waveform icon, selected)
                ★ LiveChip state=live label="LIVE FEED"
  Body    : · LineChart (ECharts — streaming health signal)
                - y-axis ticks: 0, 50, 100, 150, 200, 250
                - x-axis: 21:25:30 · 21:26 · 21:26:30 · 21:27
                - dotted gridlines, single series, cyan stroke
  Footer  : · KvRow "SAMPLE_HEALTH" "OK"
            · KvRow "APACHE_ECHARTS" "5.4.1" (right-aligned)
            · Chip "CURRENT_STREAM: 2023-02-28T20:27:07.235Z: 170" (full-width cyan bg)
  Status  : live

  Atoms used:
  ★ LineChart           (ECharts wrapper)
  ★ IconButton × 2
  ★ LiveChip
  ★ KvRow × 4
  ★ Chip
```

---

## 6. RuntimeMetrics

```
■ RuntimeMetrics                             status=idle  variant=default
  Frame   : corner ticks, label strip "RUNTIME METRICS"
  Header  : · Title "RUNTIME METRICS"
            · BarStats (top of body, inline in Header row)
                ↳ ■ LoadBar
                    Body  : · Dot (cyan) + Label "IDX_21321_LOAD" + ProgressBar (full, cyan)
                ↳ ■ ThreBar
                    Body  : · Dot (amber) + Label "IDX_75322_THRE" + ProgressBar (partial, amber)
  Body    : · KvGrid (2 columns, each column = stacked KvRows)
              Col A
                ★ KvRow "CORE_TEMP_AVG"    162.56     °F
                ★ KvRow "CORE_THRE_AVG"    35.85      %
                ★ KvRow "CORE_LOAD_MAX"    80.46      %
                ★ KvRow "CACHE_LAT"        51         ms
                ★ KvRow "DRAM_LAT"         51         ms
                ★ KvRow "WATER_PUMP_SP"    765.83     rpm
                ★ KvRow "YAW_AXIS_DEG"     14.88      °c
                ★ KvRow "YAW_AXIS_VEL"     59.27      deg/s
                ★ KvRow "CURR_OUTPUT"      111.19     w     emphasis=warn
                ★ KvRow "MAX_OUTPUT"       13931      w
              Col B
                ★ KvRow "TOTAL_THREADS"    32         —
                ★ KvRow "FREQ_GOVERNOR"    conservative  —
                ★ KvRow "OUTPUT_RANGE"     1181.2     mw    emphasis=highlight (selected)
                ★ KvRow "STEAM_PRESSURE"   74.43      bar   emphasis=warn
                ★ KvRow "STEAM_TEMP"       250.72     °c
                ★ KvRow "TURBINE_SPEED"    6538.55    rpm
                ★ KvRow "TURBINE_VIBR"     46.1       hz
                ★ KvRow "TURBINE_HOTSPOT"  85.6       °c
                ★ KvRow "MAIN_BEARING_TEMP" 81.4      °c    emphasis=warn
                ★ KvRow "TOTAL_PWR"        13931      mWh
                ★ KvRow "UPTIME"           1          days
  Footer  : (none — metrics flush to bottom)
  Status  : idle (individual KvRows carry their own emphasis)

  Atoms used:
  ★ ProgressBar × 2
  ★ KvRow × ~22
  ★ Dot × 2
```

---

## 7. ActiveNodes

```
■ ActiveNodes                                status=idle  variant=default
  Frame   : corner ticks, label strip "ACTIVE NODES"
  Header  : · Title "ACTIVE NODES"
            · StatusRow (3 KvRows inline)
                ★ KvRow "SOCKET_CONNECTION" "OK"
                ★ KvRow "LOCATION"          "US-WEST_2"
                ★ KvRow "AUTH_STATUS"       "OK"
  Body    : · SummaryTiles (3 columns)
              ↳ ■ NodesTile
                  Body : · Icon(grid-2x2) + Title "NODES"
                         · KvRow "SYS" "162"
                         · KvRow "AVG" "99"
              ↳ ■ ActiveTile
                  Body : · Icon(waveform) + Title "ACTIVE"
                         · KvRow "DIA" "OK"
                         · KvRow "%"   "97%"
              ↳ ■ AlarmsTile
                  Body : · Icon(triangle) + Title "ALARMS"
                         · KvRow "HIGH" "8"
                         · KvRow "AVG"  "—"
            · NodeGrid (grid of dots/cells — visual heatmap)
                - rows × cols of ★ NodeCell (dot | filled-square | empty)
                - red-outlined squares mark alarmed nodes
  Footer  : · IconButton (slider-filter icon)
            · FilterTabs ("RESET", "LOW_SEV", "MED_SEV", "HIGH_SEV" [selected])
  Status  : idle

  Atoms used:
  ★ Icon × 3             (grid, waveform, triangle)
  ★ KvRow × 9
  ★ NodeCell × N
  ★ IconButton
  ★ FilterTab × 4
```

---

## 8. AlarmStats  ← the canonical example from the prompt

```
■ AlarmStats                                 status=idle  variant=default
  Frame   : corner ticks, label strip "ALARM STATS"
  Header  : · ColumnHeaders ("ONLINE" · "ALARMS" · "SLA")
  Body    : · 3-col grid:
              ↳ ■ Online     variant=borderless
                  Body   : ★ Stat value=102 denominator=109 labelLeft="ACTIVE" labelRight="ALL" status=ok
                           ★ ActivityIndicator total=4 active=2 status=ok
              ↳ ■ Alarms     variant=borderless
                  Body   : ★ Stat value=14 denominator=23 labelLeft="12H" labelRight="24H" status=warn
                           ★ ActivityIndicator total=4 active=2 status=warn
              ↳ ■ Sla        variant=borderless
                  Body   : ★ Stat value=99.4 denominator=100 labelLeft="UPTIME" labelRight="—" status=ok
                           ★ ActivityIndicator total=4 active=2 status=ok
  Footer  : (none — child Panels render their own accent bars)
  Status  : idle

  Atoms used:
  ★ Stat × 3
  ★ AccentRule × 3
```

### 8.1 AlarmStats children — atomic form

```
■ Online                                     status=ok  variant=borderless
  Frame   : (none — borderless)
  Header  : (none — parent AlarmStats provides column label)
  Body    : ★ Stat
              value       = 102
              denominator = 109
              unit        = (none)
              labelLeft   = "ACTIVE"
              labelRight  = "ALL"
              status      = ok
            ★ ActivityIndicator total=4 active=2 status=ok
  Footer  : (none)
  Status  : ok

■ Alarms                                     status=warn  variant=borderless
  Body    : ★ Stat value=14 denominator=23 labelLeft="12H" labelRight="24H" status=warn
            ★ ActivityIndicator total=4 active=2 status=warn

■ Sla                                        status=ok  variant=borderless
  Body    : ★ Stat value=99.4 denominator=100 labelLeft="UPTIME" labelRight="—" status=ok
            ★ ActivityIndicator total=4 active=2 status=ok

> KB — see docs/knowledge-bases/panel-model-fidelity-corrections.md §1:
> `AccentRule` was the wrong atom for these footers; the reference shows a
> 4-segment `ActivityIndicator` (2 filled + 2 outlined), not a single bar.
> Label is a two-part left/right pair, not a centered single string.
```

---

## 9. AlarmList

```
■ AlarmList                                  status=idle  variant=default
  Frame   : corner ticks, label strip "ALARM LIST"
  Header  : · Title "ALARM LIST"
  Body    : · ul[role=list] of ↳ AlarmCard × N
  Footer  : (none — list scrolls)
  Status  : idle (aggregated) — individual cards carry their own status

  Atoms used:
  ↳ AlarmCard × N
```

### 9.1 AlarmCard (repeatable Panel)

```
■ AlarmCard                                  status=<warn|crit>  variant=default
  Frame   : hairline border, left-edge accent (color = status)
  Header  : · Icon(triangle, status-colored)
            · Title "ID: 42969"
            · Subtitle "HYDR_PUMP_AERATION"  (uppercase mono, lg)
            · MetaRow "DUE DATE: 2024-01-28"
            · TagGrid (right-aligned 4-col grid of ★ Chip × 12)
                - values like "OBX – MC1", "EVC – MC1", "ERR – MC1", "CTA – MC1", "AXH – MC1", "DCX – MC1"
                - chips render with bg color when "selected" (e.g. cyan "CTA – MC1")
                - red text when `status=crit` for the corresponding chip
  Body    : · Prose "DESC: <multi-line description>"     (sans font, --fg-1)
  Footer  : (none)
  Status  : derived from severity

  Atoms used:
  ★ Icon                (triangle, status-colored)
  ★ Title, Subtitle
  ★ KvRow "DUE DATE"
  ★ Chip × ~12
  ★ Prose
```

Example cards visible in the reference:
- `ID: 42953  MAIN_BEARING_TEMP    DUE 2023-12-28   status=warn`
- `ID: 42969  HYDR_PUMP_AERATION   DUE 2024-01-28   status=warn`
- `ID: 42959  MAIN_BEARING_VIBR    DUE 2024-01-28   status=warn`

---

## 10. Atomic Leaf Catalogue

Every `★` referenced above resolves to one of these standalone components:

| Leaf | Purpose | Inputs |
|---|---|---|
| `Stat` | Hero numeral with denominator + unit + label | `value`, `denominator?`, `unit?`, `label?`, `status` |
| `KvRow` | Key/value/unit row | `k`, `v`, `unit?`, `emphasis?` |
| `SparkLine` | Inline mini-chart | `data`, `height?`, `status?` |
| `LineChart` | Full chart wrapper (ECharts) | `series`, `xAxis?`, `yAxis?` |
| `ProgressBar` | Horizontal fill bar | `value`, `max`, `color?` |
| `LiveChip` | Pulsing dot + text | `state`, `label?` |
| `Chip` | Small uppercase tag | `text`, `tone?` ('default' \| 'accent' \| 'warn' \| 'crit') |
| `Tag` | Section marker (e.g. "SAMPLE ANALYSIS") | `text` |
| `Icon` | Inline SVG from registry | `name`, `size?` |
| `IconButton` | Icon wrapped in button | `name`, `label`, `selected?` |
| `NavTab` | Header nav link | `label`, `active`, `href` |
| `FilterTab` | Footer filter link | `label`, `active` |
| `NodeCell` | Single dot / cell in node grid | `state` ('empty' \| 'active' \| 'alarm') |
| `AccentRule` | Full-width accent bar | `color?` |
| `Dot` | 8px colored dot | `color` |
| `Title` / `Subtitle` | Typography primitives | `text` |
| `Prose` | Multi-line description | (ng-content) |
| `ModelCanvas` | WebGL/Canvas2D host | `seed`, `paused?` |

---

## 11. Component Count Summary

Used to estimate generator workload.

| Category | Count |
|---|---|
| Feature Panels | 6 (ModelRender, HealthMonitor, RuntimeMetrics, ActiveNodes, AlarmStats, AlarmList) |
| Sub-Panels | 7 (Online, Alarms, Sla, LoadBar, ThreBar, NodesTile, ActiveTile, AlarmsTile, AlarmCard) |
| Primitives (Panel + slots) | 4 |
| Atomic leaves | 18 |
| Layout components | 3 (AppShell, AppHeader, DashboardPage) |
| **Total** | **~38 standalone components** |

---

## 12. Implementation Order (ties to 00-plan §9)

1. Tokens & theme.
2. Panel primitives (`Panel`, `PanelHeader`, `PanelBody`, `PanelFooter`, corner ticks, mixins).
3. Atomic leaves (all 18) — built against a `/atoms` preview route.
4. Feature Panels in order: **AlarmStats** (smallest, best pattern proof) → RuntimeMetrics → HealthMonitor → ActiveNodes → AlarmList → ModelRender.
5. Layout (AppHeader, DashboardPage).
6. Mock data service.
7. Theme toggle + reduced-motion guards.
8. Playwright visual baseline.
