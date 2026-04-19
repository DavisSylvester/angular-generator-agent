# Decomposition Process — Reference → Panel Tree

> How to take **any** UI reference (screenshot, Figma export, competitor page, whiteboard photo) and reduce it to a Panel tree that satisfies the [`01-panel-interface.md`](01-panel-interface.md) contract.
>
> This document defines the **process**, not the output. Applied outputs live under [`examples/`](examples/).

---

## Table of Contents

1. [Inputs](#1-inputs)
2. [The Algorithm](#2-the-algorithm)
3. [Decision Heuristics](#3-decision-heuristics)
4. [Atomic Leaf Discovery](#4-atomic-leaf-discovery)
5. [Naming Rules](#5-naming-rules)
6. [Region Map Production](#6-region-map-production)
7. [Deliverables per Reference](#7-deliverables-per-reference)
8. [Feedback Loop to the Pattern](#8-feedback-loop-to-the-pattern)

---

## 1. Inputs

A decomposition run accepts one or more of:

| Input | Purpose |
|---|---|
| A reference image (PNG/JPG) | Primary source of truth for layout, color, typography |
| A reference URL (optional) | Live DOM we can inspect for structure cues |
| A brief (PRD, design notes, copy deck) | Clarifies intent where the visual is ambiguous |
| Prior examples | Reuse naming and atom inventory; reveals coverage gaps |

The process does **not** assume any single input shape. The reference image alone is sufficient.

---

## 2. The Algorithm

> **HARD precondition — describe-before-name.** At every node, before naming any atom:
> 1. Write a **literal visual description** of the region's contents: count distinct elements, record shape / fill vs outline / color / alignment / repetition count. Read at **native pixel size**, not fit-to-window zoom.
> 2. Only then consult the atom catalogue.
> 3. For every atom you name, assert in writing: *"this atom with these inputs can render exactly what the reference shows."* If the honest answer is "close but not exact," either extend the atom's inputs (pattern change) or propose a new atom (example `atoms-delta.md`).
>
> Skipping these steps is how `AccentRule` got written where a 4-segment `ActivityIndicator` belonged. See KB §1 — `docs/knowledge-bases/panel-model-fidelity-corrections.md`.

Decomposition is a depth-first walk. At each node, apply the same five steps, then recurse.

```
decompose(region):
  1. FRAME      → does this region have visible chrome (border, label strip, corner ticks)?
  2. HEADER     → is there a top strip with title / meta / controls?
  3. BODY       → what is the payload? pick one:
                    a. another Panel         → recurse into each child region
                    b. a collection          → recurse into one prototypical child (then × N)
                    c. a primitive           → mark region as ATOMIC LEAF; stop
  4. FOOTER     → is there a bottom strip with telemetry / actions / accent rule?
  5. STATUS     → what ambient state drives color / pulse (ok | warn | crit | live | idle)?

  emit Panel { id, frame, header, body, footer, status, children[] }
```

Recursion terminates when **Body** is a primitive — that region is an **atomic leaf** and is not further decomposed.

### 2.1 Worked abstraction

```
■ Page
└── ■ SectionGroup
    ├── ■ FeaturePanelA
    │   ├── ■ ChildPanelA1
    │   └── ★ AtomicLeafA2
    └── ■ FeaturePanelB
        └── ■ ListPanel
            └── ■ ListItemPanel   ← prototype, × N
                ├── ★ AtomLabel
                └── ★ AtomChip
```

No node has more than the five slots. Depth is bounded only by the reference.

---

## 3. Decision Heuristics

Use these when a region is ambiguous.

### 3.1 Frame vs. no Frame

A region has a Frame when **any** of the following are true:

- It has a visible border, outline, inset, or dropshadow.
- It has corner ticks, L-brackets, or a label strip hovering over its edge.
- It is visually **separated** from neighbors by more than standard body gutter.

Otherwise: `variant="borderless"` — the region is a logical grouping only.

### 3.2 Header vs. Body content

A Header is the region above the first meaningful payload whose contents are labels/meta/controls — **not data**. If a "top strip" contains data (a stat, a chart), it is part of Body, not Header.

### 3.3 Footer vs. trailing Body content

A Footer typically contains one of:
- Accent rule / underline
- Timestamp / source / version
- Secondary actions (filters, pagination)
- Status telemetry ("SAMPLE HEALTH: OK")

If none of these apply and the bottom content is data, it belongs to Body.

### 3.4 Nested Panel vs. atomic leaf

Ask: *is the content a primitive (single number, single line of text, single visual shape), or is it itself decomposable into slots?*

- Primitive → atomic leaf (★)
- Decomposable (has its own mini-header or mini-footer) → nested Panel (■)

**Tie-breaker:** if two reasonable people might decompose it either way, prefer the atomic leaf. Flatter is cheaper to build and maintain.

### 3.5 Collection items

When Body contains a list or grid of repeating elements:
- Decompose **one prototypical item** fully.
- Declare the collection as `prototype × N`.
- Only split into multiple prototypes when items have visually distinct shapes (e.g. compact row vs. expanded card).

### 3.6 Status assignment

Status reflects the **dominant semantic** of the region, not the strongest color pixel:
- `live` when the region is actively streaming / pulsing.
- `warn` / `crit` when the region's contents signal elevated severity.
- `ok` when the region explicitly affirms health.
- `idle` otherwise (most containers).

A container's status is **not** the sum of its children's statuses. A dashboard with one red card is still `idle` at the top; the red card is `crit` at its own level.

---

## 4. Atomic Leaf Discovery

The pattern maintains a growing catalogue of atomic leaves. For each new reference:

1. Walk to every ★ node in the draft tree.
2. Match its shape against existing atoms in the catalogue ([`01-panel-interface.md`](01-panel-interface.md) §6).
3. If it matches → reuse.
4. If it does not match → propose a new atom with:
   - a name (noun, PascalCase, singular)
   - an inputs signature
   - a one-line purpose
   - a sketch of the DOM it renders
5. New atoms are **proposed**, not auto-accepted. They land in the example's `tuning-notes.md` and are considered for promotion into the pattern catalogue during [§8 feedback](#8-feedback-loop-to-the-pattern).

**Do not invent atoms to avoid nesting a Panel.** If a region truly has slots, it is a Panel, even if it only ever appears once.

---

## 5. Naming Rules

- Panel ids use `kebab-case`, hierarchical with dots: `alarm-stats.online`, `alarm-list.card.0`.
- Names describe **role**, not appearance: `primary-stat`, not `big-number`.
- Collection prototypes use `.<id>.<index>` where `<index>` is `0` for the prototype.
- Atomic leaf components use PascalCase nouns: `Stat`, `KvRow`, `LiveChip`.
- A name collision across examples triggers a rename in the newer example — the pattern catalogue owns the canonical spelling.

---

## 6. Region Map Production

The decomposition tree yields a `reference-regions.json` used by [`03-visual-validation.md`](03-visual-validation.md). Process:

1. For every Panel id in the tree, authoring a bounding box `[x, y, w, h]` in the reference's pixel space.
2. Atomic leaves **may** receive a bbox when they warrant individual visual validation (hero stats, icons). Trivial leaves (a label) inherit their parent's Panel bbox.
3. Store at `examples/<example-id>/regions.json`.

The region map is authored once per reference revision. Sub-pixel precision is not required; ±2 px is fine.

### 6.1 When to split a region

Split a single visible box into multiple regions only when you want **independent** validation — e.g. the three columns of a stats panel each get their own bbox so one column can fail without dragging the others.

---

## 7. Deliverables per Reference

For each reference the process produces exactly these artifacts under `examples/<example-id>/`:

```
examples/<example-id>/
├── README.md              # What this example is, where the reference came from
├── reference.png          # The source image (committed)
├── decomposition.md       # The Panel tree, following the format in §2
├── regions.json           # Bounding boxes per Panel id
├── atoms-delta.md         # Atoms proposed by this example (may be empty)
└── tuning-notes.md        # Observations that should feed back into the pattern
```

`decomposition.md` must:
- List every Panel with Frame / Header / Body / Footer / Status notes.
- Mark every atomic leaf with `★` and point to the atom's catalogue entry (or to `atoms-delta.md` if newly proposed).
- Include a depth-indented tree summary at the top.
- End with a per-category component count (for generator workload estimation).

---

## 8. Feedback Loop to the Pattern

The pattern is never frozen. Each example earns the right to propose changes to the upstream pattern docs.

### 8.1 Eligible changes

A tuning example may propose:

- **New atomic leaves** (if the shape recurs or will plausibly recur).
- **New Panel variants** (e.g. a Panel with a dual-footer needs `variant="split-footer"`).
- **New status values** (rare — resist unless semantically distinct from the existing five).
- **New attribute checks** for [`03-visual-validation.md`](03-visual-validation.md) (e.g. "measure dotted-border density").
- **New tokens** (e.g. a color the existing palette cannot express).

### 8.2 Ineligible changes

A tuning example may **not**:

- Break the 5-slot Panel contract.
- Introduce an atom that is a near-duplicate of an existing atom (rename or extend, don't fork).
- Hard-code layout numbers into the pattern docs (those live in the example, not the pattern).

### 8.3 Promotion workflow

1. Example author opens `atoms-delta.md` / `tuning-notes.md` during decomposition.
2. Before implementation starts, author reviews the delta against the pattern docs.
3. Accepted items are promoted: a PR edits `01-panel-interface.md` / `03-visual-validation.md` / `00-plan.md` and removes the item from the delta.
4. Rejected items stay in the example's delta with a one-line rationale so future examples don't re-propose them.

### 8.4 What "fine-tuning" means here

The pattern's correctness is proven by how cleanly new references decompose into it:

- **Good sign:** a new reference produces zero atoms-delta items and the tree is legible without footnotes.
- **Warning sign:** a new reference needs awkward phrasing to fit — resist the urge to bend the reference; fix the pattern instead.
- **Bad sign:** two consecutive references need mutually incompatible extensions. Stop, reconcile, then continue.

---

## 9. Out of Scope

- Automated vision-model decomposition. A human authors the first pass; an LLM may assist with naming / atom matching once the pattern is stable.
- Cross-reference style linting (e.g. forcing every example to use the same palette). Each reference carries its own tokens; the pattern governs structure, not palette.
