# Agentic Flow — Swimlane Diagram

End-to-end flow of the Angular UI generator agent. Rendered as a Mermaid sequence diagram (swimlane-equivalent: each participant is a lane, arrows are handoffs).

## Lanes

| Lane | Role |
|------|------|
| **User** | Supplies PRD, selects Stitch design |
| **Orchestrator** | `src/orchestrator/pipeline.mts` — coordinates all phases |
| **Dribbble** | Design inspiration source (API → scraper → cache) |
| **Stitch** | Google Stitch design generator (live → cache) |
| **LLM** | Claude — Opus (planning/design) + Sonnet (codegen/fixes) |
| **KB** | Knowledge base — `docs/knowledge-bases/*` fidelity corrections |
| **Playwright** | `scripts/verify.mts` — Stage A/B/C pixel-diff validator |
| **FS** | File system — generated Angular workspace + reports |

## Diagram

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant O as Orchestrator
    participant D as Dribbble
    participant S as Stitch
    participant L as LLM (Opus/Sonnet)
    participant KB as Knowledge Base
    participant P as Playwright
    participant FS as File System

    Note over U,FS: Phase 0 — Preflight & Workspace Init
    U->>O: PRD + config
    O->>FS: init workspace, validate deps
    O->>KB: preflight load fidelity-corrections.md
    KB-->>O: applicable Prevention entries

    Note over U,FS: Phase 1 — Design Inspiration (Hard Gate)
    O->>D: search(PRD-derived queries)
    alt API ok
        D-->>O: results
    else API fails
        O->>D: scraper fallback
        alt scraper ok
            D-->>O: results
        else scraper fails
            O->>D: cache fallback
            alt cache hit
                D-->>O: results
            else cache miss
                O-->>U: ABORT (hard gate)
            end
        end
    end
    O->>L: design-selection(results)
    L-->>O: selected inspiration

    Note over U,FS: Phase 2 — Stitch Design (Hard Gate)
    O->>S: generate(PRD + inspiration)
    alt live ok
        S-->>O: designs
    else live fails
        O->>S: cache fallback
        alt cache hit
            S-->>O: designs
        else cache miss
            O-->>U: ABORT (hard gate)
        end
    end
    O->>U: open previews
    U-->>O: selected design
    O->>L: extract style guide
    L-->>O: tokens, palette, spacing

    Note over U,FS: Phase 3 — Component Library
    O->>L: component-library-agent(tokens)
    L-->>O: design tokens + atom specs
    O->>FS: write design-tokens.scss, specs

    Note over U,FS: Phase 4 — Planning & Per-Element Build (Bottom-Up)
    O->>L: planning-agent (task graph)
    L-->>O: ordered atoms → panels → layout
    loop For each element (atoms → panels → layout)
        O->>KB: load entries for this element
        KB-->>O: Prevention hints
        O->>L: codegen (with KB hints)
        L-->>FS: .ts / .html / .scss

        loop Fix Loop — max 10 iter (lint/TS)
            O->>L: validate + lint
            L-->>O: errors?
            alt errors
                O->>L: fix
                L-->>FS: patched code
            else clean
            end
        end

        Note over O,P: Phase 5 — Stage C Verify (per element)
        O->>P: verify.mts <element-id>
        P->>FS: Stage A baseline
        P->>FS: Stage B live capture
        P->>P: Stage C pixel-diff (10% threshold)
        P-->>O: summary.json (pass/fail per region)

        loop Fidelity Fix Loop — max 30 iter (KB budget §5)
            alt Stage C fail
                O->>KB: consult matching motifs
                KB-->>O: correction guidance
                O->>L: fix with KB hints (prefer Sonnet)
                L-->>FS: patched code
                O->>P: re-verify
                P-->>O: summary.json
            else Stage C pass
            end
        end

        alt budget exhausted
            O->>FS: document drift category, escalate
        end
    end

    Note over U,FS: Phase 6 — Build & Whole-Page Verify
    O->>FS: bun run build
    alt build fails
        O->>L: fix build errors
        L-->>FS: patched code
    end
    O->>P: whole-page Stage C (all regions.json)
    P-->>O: final report
    O->>L: visual-fidelity-agent (LLM review)
    L-->>O: fidelity score

    Note over U,FS: Phase 7 — Summary & Reporting
    O->>FS: decisions.md, cost report, fidelity scores
    O-->>U: run complete
```

## Decision & Loop Points

| # | Point | Branch | Cap |
|---|-------|--------|-----|
| 1 | Dribbble source | API → scraper → cache → **abort** | 3 strategies, hard gate |
| 2 | Stitch generation | live → cache → **abort** | 2 strategies, hard gate |
| 3 | Fix Loop (lint/TS) | errors → LLM fix → re-lint | **10 iter/task** |
| 4 | Fidelity Fix Loop (Stage C) | pixel miss > 10% → KB → LLM fix → re-verify | **30 iter/element** (KB §5) |
| 5 | Budget exhausted | categorize drift, document, move on | hard stop |
| 6 | Build failure | LLM fixes, retry compile | implicit fix-loop |

## Key File Pointers

- `src/index.mts:64` — entry point, CLI + login
- `src/orchestrator/pipeline.mts:104` — 6-phase orchestrator
- `src/orchestrator/fix-loop.mts:41` — 10-iter lint/TS loop
- `scripts/verify.mts:43` — Stage A/B/C Playwright validator (10% threshold at line 16)
- `docs/ui-plan/04-per-element-workflow.md:66` — universal per-element workflow
- `docs/prompts/codegen.md:1` — mandatory KB preflight for codegen
- `docs/prompts/visual-fidelity.md:1` — visual reviewer prompt
- `docs/knowledge-bases/panel-model-fidelity-corrections.md:1` — KB source
