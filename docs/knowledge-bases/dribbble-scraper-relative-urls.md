# Knowledge Base: Dribbble Scraper — Relative URLs and False Positives

## Problem

The Dribbble scraper was returning 0 designs despite the browser successfully loading Dribbble search result pages. Two issues:

1. **Relative URLs**: Playwright's `ariaSnapshot()` outputs link URLs as relative paths (`/shots/25746041-...`) but the parser regex expected full URLs (`https://dribbble.com/shots/...`)
2. **False positives**: Navigation links like "Explore" (`/shots/popular`) were being matched as shot cards because the regex only checked for `/shots/` without requiring a numeric ID

## Detection

The snapshot contained valid shot data:
```
- link "View Construction Management Dashboard" [ref=e37] url: /shots/25121005-Construction-Management-Dashboard
```

But the regex `https?:\/\/dribbble\.com\/shots\/\S+` required a full URL, so it never matched.

## Fix

### 1. Accept relative URLs
Changed regex from:
```
/link\s+"([^"]+)"\s+.*?url:\s*(https?:\/\/dribbble\.com\/shots\/\S+)/i
```
To:
```
/link\s+"([^"]+)"\s+.*?url:\s*((?:https?:\/\/dribbble\.com)?\/shots\/\d+\S*)/i
```

The `\d+` after `/shots/` ensures only real shot IDs match (not `/shots/popular`).

### 2. Make URLs absolute
When a relative URL is captured, prepend `https://dribbble.com`:
```ts
if (url.startsWith("/")) url = `https://dribbble.com${url}`;
```

### 3. Strip "View " prefix
Dribbble link text includes "View " prefix (e.g., `"View Construction Management Dashboard"`). The parser now strips it.

### 4. Author name deduplication
Author links repeat the name (e.g., `"Amirul Islam Amirul Islam"`). Added detection to trim duplicated halves.

## Key Files

- `src/services/dribbble-scraper.mts` — `parseSnapshot()` method

## Symptoms When Broken

- Log shows `Scraped 0 designs for query "..."` for every query
- Pipeline aborts with `Aborting pipeline — Dribbble search failed from all sources`
- Debug snapshot logging (when enabled) shows lines with `/shots/` present but not matched

## Prevention

When changing the snapshot format (e.g., switching from MCP to bridge), always test `parseSnapshot()` against a real Dribbble search snapshot. The snapshot format is the contract between the browser layer and the scraper.
