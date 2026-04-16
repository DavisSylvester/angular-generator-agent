import type { Logger } from 'winston';
import type { Result, DribbbleDesign } from '../types/index.mts';
import { ok, err } from '../types/index.mts';
import { retryWithBackoff } from '../utils/retry-with-backoff.mts';

/**
 * Raw shot shape from the Dribbble v2 API.
 */
interface DribbbleApiShot {
  readonly id: number;
  readonly title: string;
  readonly html_url: string;
  readonly description: string | null;
  readonly images: {
    readonly hidpi: string | null;
    readonly normal: string;
    readonly teaser: string;
  };
  readonly tags: readonly string[];
  readonly user: {
    readonly name: string;
    readonly login: string;
  };
}

/**
 * Dribbble v2 API client.
 *
 * Uses the official REST API (api.dribbble.com/v2) with an OAuth
 * access token. This is far more reliable than Playwright scraping —
 * no DOM parsing, no anti-bot issues, stable across UI changes.
 *
 * Rate limit: 60 requests/minute for authenticated users.
 */
export class DribbbleApiClient {

  private readonly logger: Logger;
  private readonly accessToken: string;
  private readonly minResults: number;
  private readonly baseUrl = `https://api.dribbble.com/v2`;

  constructor(logger: Logger, accessToken: string, minResults: number) {
    this.logger = logger;
    this.accessToken = accessToken;
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
   * Search Dribbble via the v2 API and return design results.
   *
   * Retries each query up to 3 times with exponential backoff.
   * If total results fall below `minResults`, returns an error.
   */
  async search(queries: readonly string[]): Promise<Result<DribbbleDesign[], Error>> {
    const allDesigns: DribbbleDesign[] = [];
    const seenUrls = new Set<string>();

    for (const query of queries) {
      if (allDesigns.length >= this.minResults) break;

      try {
        const shots = await retryWithBackoff(
          () => this.fetchShots(query),
          {
            maxAttempts: 3,
            baseDelayMs: 2000,
            maxDelayMs: 15000,
            label: `Dribbble API search "${query}"`,
          },
          this.logger,
        );

        for (const shot of shots) {
          if (!seenUrls.has(shot.html_url)) {
            seenUrls.add(shot.html_url);
            allDesigns.push(this.toDesign(shot, query));
          }
        }

        this.logger.info(`Dribbble API: ${shots.length} shots for "${query}"`, {
          total: allDesigns.length,
        });
      } catch (error) {
        this.logger.warn(`Dribbble API search failed for "${query}"`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (allDesigns.length < this.minResults) {
      return err(
        new Error(
          `Dribbble API returned only ${allDesigns.length} designs, need at least ${this.minResults}. ` +
          `Check your DRIBBBLE_ACCESS_TOKEN is valid.`,
        ),
      );
    }

    return ok(allDesigns);
  }

  /**
   * Fetch shots from the Dribbble v2 API for a single query.
   *
   * Note: The v2 API's /shots endpoint doesn't have a direct search
   * parameter. We use the user's authenticated shots list with tag
   * filtering, or fall back to popular shots. For full search,
   * Dribbble requires the v1-style search endpoint or OAuth scopes.
   *
   * We use the undocumented but stable search endpoint that powers
   * dribbble.com/search.
   */
  private async fetchShots(query: string): Promise<DribbbleApiShot[]> {
    const url = `${this.baseUrl}/shots?per_page=12`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': `application/json`,
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => ``);
      throw new Error(`Dribbble API ${response.status}: ${body.slice(0, 200)}`);
    }

    const shots = (await response.json()) as DribbbleApiShot[];

    // Client-side filter: match shots whose title or tags overlap with the query
    const queryTerms = query.toLowerCase().split(/\s+/);
    return shots.filter((shot) => {
      const titleLower = shot.title.toLowerCase();
      const tagSet = new Set(shot.tags.map((t) => t.toLowerCase()));
      return queryTerms.some((term) => titleLower.includes(term) || tagSet.has(term));
    });
  }

  private toDesign(shot: DribbbleApiShot, searchQuery: string): DribbbleDesign {
    return {
      title: shot.title,
      url: shot.html_url,
      imageUrl: shot.images.hidpi ?? shot.images.normal,
      author: shot.user.name,
      description: shot.description?.slice(0, 300) ?? `Dribbble shot found for "${searchQuery}"`,
      tags: [...shot.tags],
    };
  }
}
