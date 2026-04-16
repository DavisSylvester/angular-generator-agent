# Knowledge Base: Google Stitch Iframe Form Submission

## Problem

Google Stitch (`stitch.withgoogle.com`) renders its entire UI inside a **cross-origin iframe** hosted at `app-companion-430619.appspot.com`. Playwright's `page.ariaSnapshot()` only captures the page-level DOM, which shows just `main > iframe` with zero interactive elements. This means:

1. `ariaSnapshot()` returns no textboxes, buttons, or radios
2. Ref-based `fill(ref)` / `click(ref)` cannot target elements inside the iframe
3. The Stitch service falls back to putting the prompt in the URL query string, which doesn't trigger generation

## Stitch UI Elements (as of April 2026)

| Element | Type | Selector |
|---------|------|----------|
| Prompt input | TipTap/ProseMirror contenteditable div | `[contenteditable="true"]` or `[role="textbox"]` |
| Web mode toggle | Button (not radio) | `button:has-text("Web")` |
| Generate button | Button with aria-label (no visible text) | `button[aria-label="Generate designs"]` |
| App mode toggle | Button | `button:has-text("App")` |

## Fix

### 1. Frame-aware selector commands

Added `fillSelector` and `clickSelector` bridge commands that use `page.frameLocator("iframe").first()` to target elements inside the iframe before falling back to the main page.

### 2. Contenteditable handling

Standard `.fill()` doesn't work on `contenteditable` divs (TipTap/ProseMirror editors). The bridge detects `contenteditable="true"` and uses `click() → selectText() → pressSequentially()` instead.

### 3. Retry loop for prompt input

After navigating to `stitch.withgoogle.com/`, the iframe content may not be immediately available. The service retries finding the prompt input up to 3 times with 3-second backoff.

### 4. URL detection via getCurrentUrl

After clicking Generate, the snapshot can't see the project URL (it's in the browser address bar, not the iframe DOM). Added a `getCurrentUrl` bridge command that returns `activePage.url()`. The service polls every 5 seconds for up to 60 seconds, checking if the URL contains `/projects/`.

## Key Files

- `src/browser/launch-server.cjs` — `fillSelector`, `clickSelector`, `getCurrentUrl` handlers
- `src/services/stitch-service.mts` — `submitToStitch()` method with retry + polling
- `src/orchestrator/pipeline.mts` — Wires `fillSelector`, `clickSelector`, `getCurrentUrl` to Stitch callbacks

## Symptoms When Broken

- Only the 1st Stitch design gets a real `/projects/<id>` URL
- Designs 2-6 get `?prompt=...` query string URLs
- Log shows: `Could not fill prompt via any selector — falling back to URL query string`
