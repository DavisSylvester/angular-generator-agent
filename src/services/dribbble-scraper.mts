import type { Logger } from 'winston';
import type { Result, DribbbleDesign } from '../types/index.mts';
import { ok, err } from '../types/index.mts';
import { retryWithBackoff } from '../utils/retry-with-backoff.mts';

/**
 * Scrapes Dribbble for design inspiration using Playwright MCP tools.
 *
 * Flow:
 *   1. Navigate to dribbble.com/search/<query>
 *   2. Wait for shots to load
 *   3. Take a snapshot of the page (accessibility tree)
 *   4. Extract shot titles, URLs, authors, and image URLs
 *   5. Return at least `minResults` designs
 *
 * Requires the Playwright MCP server to be running.
 */
export class DribbbleScraper {

  private readonly logger: Logger;
  private readonly minResults: number;

  constructor(logger: Logger, minResults: number) {
    this.logger = logger;
    this.minResults = minResults;
  }

  /**
   * Build search queries from the PRD title, scope, and description.
   * Produces multiple query variants to maximise relevant results.
   */
  buildSearchQueries(projectTitle: string, projectScope: string): string[] {
    const base = projectTitle.toLowerCase().replace(/[^a-z0-9\s]/g, ``).trim();
    const scopeTerms = projectScope.toLowerCase().replace(/[^a-z0-9\s]/g, ``).trim();

    return [
      `${base} dashboard`,
      `${base} web portal`,
      `${scopeTerms} ui design`,
      `${base} admin panel`,
      `${scopeTerms} management dashboard`,
    ];
  }

  /**
   * Search Dribbble via Playwright and return scraped designs.
   *
   * @param queries - Search query strings to try
   * @param navigate - Callback that drives Playwright `browser_navigate`
   * @param snapshot - Callback that drives Playwright `browser_snapshot`
   * @param screenshot - Callback that drives Playwright `browser_take_screenshot`
   */
  async search(
    queries: readonly string[],
    navigate: (url: string) => Promise<void>,
    snapshot: () => Promise<string>,
    screenshot: () => Promise<string>,
  ): Promise<Result<DribbbleDesign[], Error>> {
    const allDesigns: DribbbleDesign[] = [];
    const seenUrls = new Set<string>();

    for (const query of queries) {
      if (allDesigns.length >= this.minResults) break;

      try {
        const parsed = await retryWithBackoff(
          () => this.scrapeQuery(query, navigate, snapshot, screenshot),
          {
            maxAttempts: 3,
            baseDelayMs: 3000,
            maxDelayMs: 15000,
            label: `Dribbble scrape "${query}"`,
          },
          this.logger,
        );

        for (const design of parsed) {
          if (!seenUrls.has(design.url)) {
            seenUrls.add(design.url);
            allDesigns.push(design);
          }
        }

        this.logger.info(`Scraped ${parsed.length} designs for query "${query}"`, {
          total: allDesigns.length,
        });
      } catch (error) {
        this.logger.warn(`Dribbble scrape failed for query "${query}" after retries`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (allDesigns.length < this.minResults) {
      return err(
        new Error(
          `Only found ${allDesigns.length} designs, need at least ${this.minResults}. ` +
          `Ensure Playwright MCP is running and dribbble.com is accessible.`,
        ),
      );
    }

    return ok(allDesigns);
  }

  /**
   * Execute a single Playwright scrape for one query. Extracted so
   * `retryWithBackoff` can re-attempt the full navigate→screenshot→parse
   * sequence on transient failures.
   */
  private async scrapeQuery(
    query: string,
    navigate: (url: string) => Promise<void>,
    snapshot: () => Promise<string>,
    screenshot: () => Promise<string>,
  ): Promise<DribbbleDesign[]> {
    const encoded = encodeURIComponent(query);
    const searchUrl = `https://dribbble.com/search/${encoded}`;

    this.logger.info(`Searching Dribbble`, { query, url: searchUrl });
    await navigate(searchUrl);

    // Take screenshot for debugging / LLM visual context
    const screenshotData = await screenshot();
    this.logger.debug(`Dribbble screenshot captured`, { query, bytes: screenshotData.length });

    // Get accessibility snapshot for structured scraping
    const snap = await snapshot();
    this.logger.debug(`Dribbble snapshot captured`, { query, lines: snap.split(`\n`).length, chars: snap.length });

    // Log first few shot-related lines for debugging
    const shotLines = snap.split(`\n`).filter((l) => l.includes(`/shots/`));
    this.logger.debug(`Snapshot contains ${shotLines.length} lines with /shots/`, {
      sample: shotLines.slice(0, 3).map((l) => l.trim()),
    });

    const designs = this.parseSnapshot(snap, query);
    this.logger.debug(`Parsed ${designs.length} designs from snapshot`, {
      titles: designs.map((d) => d.title),
    });
    return designs;
  }

  /**
   * Parse the Playwright accessibility snapshot to extract design cards.
   *
   * Dribbble shot cards typically contain:
   *   - An image (the shot thumbnail)
   *   - A link with the shot title pointing to /shots/<id>
   *   - An author name
   *
   * The snapshot is a text-based accessibility tree. We look for patterns
   * that match Dribbble's card structure.
   */
  parseSnapshot(snapshotText: string, searchQuery: string): DribbbleDesign[] {
    const designs: DribbbleDesign[] = [];
    const lines = snapshotText.split(`\n`);

    // Pattern: look for links that point to /shots/<numeric-id> (supports both relative and absolute URLs)
    const shotLinkPattern = /link\s+"([^"]+)"\s+.*?url:\s*((?:https?:\/\/dribbble\.com)?\/shots\/\d+\S*)/i;

    let currentTitle = ``;
    let currentUrl = ``;
    let currentImage = ``;
    let currentAuthor = ``;

    for (const line of lines) {
      const shotMatch = shotLinkPattern.exec(line);
      if (shotMatch) {
        // Flush previous design if we have one
        if (currentTitle && currentUrl) {
          designs.push({
            title: currentTitle,
            url: currentUrl,
            imageUrl: currentImage,
            author: currentAuthor || `Unknown`,
            description: `Dribbble shot found for "${searchQuery}"`,
            tags: searchQuery.split(/\s+/),
          });
        }

        // Strip "View " prefix that Dribbble prepends to link text
        let title = shotMatch[1] ?? ``;
        title = title.replace(/^View\s+/i, ``);
        currentTitle = title;

        // Ensure URL is absolute
        let url = shotMatch[2] ?? ``;
        if (url.startsWith(`/`)) url = `https://dribbble.com${url}`;
        currentUrl = url;

        currentImage = ``;
        currentAuthor = ``;
        continue;
      }

      // Capture images associated with current shot (img "alt" or img with url)
      const imgMatch = /img\s+"([^"]+)"(?:\s+.*?url:\s*(https?:\/\/\S+))?/i.exec(line);
      if (imgMatch && !currentImage && currentUrl) {
        currentImage = imgMatch[2] ?? ``;
      }

      // Capture author (link to /username — not /shots/, /signups/, /pro, /search)
      const authorMatch = /link\s+"([^"]+)"\s+.*?url:\s*(?:https?:\/\/dribbble\.com)?\/(?!shots\/|signups\/|pro|search)(\w+)/i.exec(line);
      if (authorMatch && !currentAuthor && currentUrl) {
        // Clean author name (may repeat like "Amirul Islam Amirul Islam")
        let author = authorMatch[1] ?? ``;
        const half = Math.floor(author.length / 2);
        if (author.length > 4 && author.slice(0, half) === author.slice(half + 1)) {
          author = author.slice(0, half);
        }
        currentAuthor = author;
      }
    }

    // Flush last design
    if (currentTitle && currentUrl) {
      designs.push({
        title: currentTitle,
        url: currentUrl,
        imageUrl: currentImage,
        author: currentAuthor || `Unknown`,
        description: `Dribbble shot found for "${searchQuery}"`,
        tags: searchQuery.split(/\s+/),
      });
    }

    return designs;
  }
}
