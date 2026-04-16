# Knowledge Base: Bun + Playwright Incompatibility

## Problem

Playwright's `chromium.launch()` and `chromium.connect()` both hang indefinitely when called from Bun. The browser process spawns (visible PID in logs) but the pipe-based IPC connection (`--remote-debugging-pipe`) never establishes. This affects all browsers (bundled Chromium, Chrome, Edge) and all modes (headed, headless). WebSocket-based `chromium.connect()` also fails with `WebSocket was closed before the connection was established`.

## Root Cause

Bun's process spawning and pipe/WebSocket implementations are incompatible with Playwright's internal IPC protocol. Playwright relies on Node.js-specific pipe file descriptors (FD 3/4) for `--remote-debugging-pipe` and Node.js WebSocket internals for `connect()`. Neither works under Bun as of v1.3.12.

## Fix

Use a **Node.js bridge process** pattern:

1. Create a `.cjs` file (`src/browser/launch-server.cjs`) that runs under Node.js
2. The bridge launches Playwright normally (works fine in Node.js)
3. Bun communicates with the bridge via **stdin/stdout JSON-RPC** (newline-delimited JSON)
4. Each Playwright operation (navigate, snapshot, screenshot, fill, click) is a JSON command/response pair

```
Bun process  ──stdin──>  Node.js bridge (Playwright)
             <──stdout──
```

## Key Files

- `src/browser/launch-server.cjs` — Node.js bridge (all Playwright calls happen here)
- `src/browser/playwright-browser.mts` — Bun-side client (spawns bridge, sends JSON commands)

## Verification

```bash
# This hangs (Bun + Playwright directly):
bun -e "import { chromium } from 'playwright'; await chromium.launch();"

# This works (Node.js + Playwright):
node -e "const { chromium } = require('playwright'); (async () => { const b = await chromium.launch({ headless: true }); console.log('ok'); await b.close(); })();"

# This works (Bun → Node.js bridge → Playwright):
bun run src/index.mts --prd sample-prds/thumbtackAngie.md --headless
```

## Impact

All browser automation in the pipeline (Dribbble scraping, Stitch design generation, build validation, visual fidelity review) routes through this bridge.
