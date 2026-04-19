# Per-Element Workflow — How Every Page Gets Built

> **This is the universal build process.** Every page, every feature Panel, every atom goes through this workflow — no exceptions. Deviations constitute a KB-worthy incident.
>
> The workflow was proven on the `full-stack-dashboard` example (converged 34/37 regions at 10% threshold across 30 iterations). It is now codified for all future references.

---

## Table of Contents

1. [The Hard Rules](#1-the-hard-rules)
2. [Order of Build](#2-order-of-build)
3. [The Per-Element Loop](#3-the-per-element-loop)
4. [Iteration Log Format](#4-iteration-log-format)
5. [When an Element is "Done"](#5-when-an-element-is-done)
6. [Escalation & Budget Exhaustion](#6-escalation--budget-exhaustion)
7. [Enforcement](#7-enforcement)

---

## 1. The Hard Rules

1. **Describe before name.** Before declaring an atom for a region, write the literal pixel description (shape count, fill vs outline, color roles, alignment, repetition count). Read at native pixel size. Per [`02-decomposition-process.md`](02-decomposition-process.md) §2 preamble. Violations are how KB §1 shipped.

2. **Bottom-up build.** Atoms before Panels. Panels before features. Features before layout. Layout before whole-page verify. A feature Panel is never authored before its atoms exist and individually pass Stage C.

3. **Verify after every create or modify.** `bun run scripts/verify.mts <example-id>` is non-optional. If the element is a single atom, hit its preview on `/atoms`. If it is a feature Panel, hit the dashboard route. Per [`03-visual-validation.md`](03-visual-validation.md) + KB §3.

4. **10 % pixel-mismatch threshold.** Hard pass/fail line. Overrides only via per-region `tolerances.json` with a written reason.

5. **30-iteration budget per element.** If the element does not pass Stage C within 30 iterations, stop. Either escalate (§6) or record the failure state and move on with documented reason.

6. **Every iteration logged as an object.** Format in §4. Append to `visual-report/<example-id>/iterations.jsonl`. Empty iterations are not allowed — every fix gets a record.

7. **No "verified" claim without a pass row.** Codified in KB §3, enforced by `docs/prompts/codegen.md` and `docs/prompts/visual-fidelity.md`.

8. **KB first.** Before writing any code for an element, load `docs/knowledge-bases/panel-model-fidelity-corrections.md` and apply every Prevention hint relevant to the motif being built.

---

## 2. Order of Build

For any new reference / example, build in this order:

```
1. reference.png committed
2. decomposition.md authored (applies 02-decomposition-process.md)
3. regions.json authored (applies 03-visual-validation.md §3.2)
4. Stage A — bun run scripts/capture-before.mts <example-id>
   → visual-baselines/<example-id>/*.png committed
5. Overlay diagnostic — bun run scripts/overview-strip.mts
   → visually confirm bboxes align with the reference
6. Tokens + theme (pattern-level, reused across examples)
7. Panel primitives (pattern-level, reused)
8. Atoms — one at a time, each verified via /atoms preview route
9. Feature Panels — one at a time, each verified via the dashboard route
10. Layout (AppHeader, DashboardPage, routes)
11. Whole-page verify — every region in regions.json, Stage C on all
12. Per-failing-region fix loop — §3 per-element loop, budget 30 each
```

**Invariant:** at every numbered step, the preceding step's artifacts exist and pass. Skipping ahead is a KB-worthy incident.

---

## 3. The Per-Element Loop

For each element (atom OR Panel OR feature OR whole page) the loop is:

```
┌──────────────────────────────────────────────────────────────────┐
│ 1. LOAD   — KB prevention hints for this element's motif         │
│                                                                  │
│ 2. DESCRIBE — literal pixel description of the reference region  │
│    (if atom: the per-atom baseline; if Panel: the panel bbox)    │
│                                                                  │
│ 3. BUILD  — write minimum viable .ts, .html, .scss               │
│                                                                  │
│ 4. VERIFY — run scripts/verify.mts <example-id>                  │
│    read the pass/fail row for THIS element's region(s)           │
│                                                                  │
│ 5. DIAGNOSE — if fail:                                           │
│    a. examine visual-report/<id>/<region>.diff.png               │
│    b. compare baseline + actual crops at native pixel size       │
│    c. categorize drift: size, position, color, font, content     │
│                                                                  │
│ 6. LOG   — append iteration object to iterations.jsonl (§4)      │
│                                                                  │
│ 7. FIX   — one focused change per iteration                      │
│    (never bundle multiple hypotheses into a single iteration —   │
│    you will not know which one moved the number)                 │
│                                                                  │
│ 8. REPEAT — from step 4 until pass OR budget exhausted           │
│                                                                  │
│ 9. COMMIT — only after pass (or with escalation reason)          │
└──────────────────────────────────────────────────────────────────┘
```

### 3.1 One hypothesis per iteration

If you change `font-size` and `padding` in the same iteration and the number drops, you don't know which helped. The log entry will say "changed 2 things" and future iterations can't build on the knowledge. **Rule: one named change per iteration.** If the change requires coupled edits (e.g. Stat grid + label grid share columns), count the couple as one hypothesis.

### 3.2 Verify is not a suggestion

The workflow pauses after step 4. Do not proceed past step 4 without observing the pass/fail row for the current element. No "looks right, moving on."

### 3.3 Diff image first

When a region fails, open `visual-report/<id>/<region>.diff.png` before thinking about the fix. The diff shows *where* pixels differ (usually as red ghosting of both baseline and actual overlaid). That picture names the class of drift — size vs position vs color vs font — which directs the fix.

---

## 4. Iteration Log Format

Every iteration appends one object to `visual-report/<example-id>/iterations.jsonl`. JSONL so it's append-only and diff-friendly.

Required fields:

```json
{
  "iteration": 17,
  "dateTried": "2026-04-18T18:05:00Z",
  "element": "alarm-stats.online",
  "issue": "diff ghosting shows baseline numerals larger than 33px render",
  "proposedFix": "font-size 33→36px",
  "plan": ["edit stat.component.scss", "verify"],
  "result": {
    "pass": false,
    "regionsPassing": 2,
    "regionsTotal": 4,
    "perRegion": {
      "alarm-stats": 8.93,
      "alarm-stats.online": 13.39,
      "alarm-stats.alarms": 9.18,
      "alarm-stats.sla": 11.31
    },
    "delta": "online regressed (11.67→13.39) — 36 is too big; return to 33"
  }
}
```

Rules:
- `iteration` — monotonic increasing, starting at 0 (initial state).
- `dateTried` — ISO-8601, converted to absolute date.
- `element` — the primary region id being worked on (for grouping).
- `issue` — literal observation from the diff image or measurement.
- `proposedFix` — single change, described concretely.
- `plan` — ordered list of the exact operations.
- `result.pass` — boolean, from Stage C.
- `result.perRegion` — every failing region's mismatch %.
- `result.delta` — one-sentence summary of what moved and why.

Iteration 0 is the baseline measurement (no fix applied yet). Subsequent iterations reference the delta from the previous result.

---

## 5. When an Element is "Done"

Three-part gate:

1. **Stage C pass** — the element's region(s) in `visual-report/<id>/summary.json` have `pass: true`.
2. **KB check** — if the element matches a motif covered by a KB entry, the comment at the top of the `.ts` file cites the entry number.
3. **ESLint + typecheck** — `bun run build` is clean.

Only after all three can the element be marked complete or the change committed with "verified" / "passes" language.

---

## 6. Escalation & Budget Exhaustion

After 30 iterations on a single element without pass, stop. Do not sneak a 31st. Instead:

### 6.1 Categorize the residual drift

- **Structural** — wrong atom, missing motif → open a KB entry, fix the pattern, retry.
- **Sub-pixel text drift** — dominated by character x-offset in crops < 30 px tall → note in the iterations log that threshold is unachievable at this crop size with current fonts; document in KB.
- **Baseline defect** — the `regions.json` bbox doesn't match the reference's actual content → fix the bbox and restart the budget (this is baseline authoring, not implementation).

### 6.2 Document the stop

Add a final iteration object with `"result.pass": false` and a `"budgetExhausted": true` field plus a `"residualCategory"` from the list above. The commit message must state "X of N regions pass; remaining failures are <category> with documented reason."

### 6.3 Do not lower the threshold to force a pass

10 % is the authoritative line. If budget exhausts and drift is legitimate, document it. If drift is structural, fix the pattern. **Do not raise the threshold to 15 % to ship.**

---

## 7. Enforcement

Multiple layers so skipping is hard:

| Layer | What it enforces |
|---|---|
| `docs/prompts/codegen.md` | Forbids "verified" language without a Stage C pass row; cites KB entry numbers in component source |
| `docs/prompts/visual-fidelity.md` | Review treats every KB Prevention hint as a hard check |
| `scripts/verify.mts` | Non-zero exit on any region failure → CI gate |
| `docs/knowledge-bases/panel-model-fidelity-corrections.md` | Growing catalogue of past failures; every agent loads it before codegen |
| Persistent memory (user memory system) | `feedback_playwright_after_every_element`, `user_model_preference` carry the rules across sessions |
| This doc (`04-per-element-workflow.md`) | Single source of truth for the build order and loop |
| Git pre-commit (planned) | Rejects commits that mention "verify" / "pass" in messages when the most recent `summary.json` shows failures |

If any of these layers is bypassed without a written reason, the workflow is broken — which is itself a KB entry.

---

## 8. First-Run Preflight — KB in context before any code

**Goal:** the first iteration on any new element should pass Stage C when its motifs are already covered by the KB. We do not re-discover known failures.

Before writing any code for an element, execute this preflight:

1. **Read the KB in full.** `docs/knowledge-bases/panel-model-fidelity-corrections.md` — every entry, not just the titles.
2. **Enumerate applicable entries.** For the element you are about to build, list the KB entries whose motifs apply (ratio stats, segmented indicators, label strips, cyan pill tags, progress bars, etc.).
3. **Inline the applicable Prevention hints.** Copy each hint verbatim into your working notes so they are in the same buffer as the code you are about to write.
4. **Read §1 hard rules and §3 loop of this doc.** Confirm the build will follow them.
5. **Cite KB entries in the `.ts` source.** A header comment like:
   ```ts
   // KB §1, §2 — applied: <short rationale>
   ```

The codegen prompt `docs/prompts/codegen.md` already encodes steps 1–5 as mandatory preflight; verify the prompt has not drifted.

### Why this matters

On the `full-stack-dashboard` first run, the AlarmStats sub-Panel took 20 iterations (0/4 → 4/4) because the `AccentRule` vs `ActivityIndicator` distinction and the Stat split-label grid constraint had not yet been codified. Once those became KB §1 and §2, the **same mistakes cost 0 iterations** on the next run — subsequent atoms converge in 1–3 iterations when their motif is covered.

If a new element takes double-digit iterations to converge, that is itself evidence the KB is missing knowledge. Open a new entry before closing the work.

---

## 9. Applying to a New Page

When a new page is added (e.g., a second reference under `examples/<new-id>/`), run:

```
# 1. Author artifacts
docs/ui-plan/examples/<new-id>/
  reference.png            (committed)
  decomposition.md         (applies 02-decomposition-process.md)
  regions.json             (pixel-scan-verified bboxes)
  atoms-delta.md           (proposals for new atoms)
  tuning-notes.md          (observations)

# 2. Baselines
bun run scripts/capture-before.mts <new-id>

# 3. Build each element following §3 loop
#    - atoms first, one at a time
#    - feature Panels next, one at a time
#    - layout last
#    each with its own iterations.jsonl entries

# 4. Whole-page verify
bun run scripts/verify.mts <new-id>

# 5. Promote atoms / pattern updates from tuning-notes.md
#    (see 02-decomposition-process.md §8 feedback loop)
```

No shortcuts. No bundled PRs that build multiple atoms without verifying each. No "tested the whole page at the end" as a substitute for per-element verification.
