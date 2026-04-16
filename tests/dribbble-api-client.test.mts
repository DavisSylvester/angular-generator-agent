import { describe, expect, it } from 'bun:test';
import { createLogger, transports } from 'winston';
import { DribbbleApiClient } from '../src/services/dribbble-api-client.mts';

const silentLogger = createLogger({ silent: true, transports: [new transports.Console()] });

describe(`DribbbleApiClient`, () => {
  const client = new DribbbleApiClient(silentLogger, `fake-token`, 5);

  describe(`buildSearchQueries`, () => {
    it(`should generate multiple query variants`, () => {
      const queries = client.buildSearchQueries(
        `Athlete Portal`,
        `Managing athletes and workouts`,
      );
      expect(queries.length).toBeGreaterThanOrEqual(3);
      expect(queries.some((q) => q.includes(`athlete`))).toBe(true);
    });

    it(`should strip special characters from queries`, () => {
      const queries = client.buildSearchQueries(
        `Test & Project (v2)`,
        `Scope: something!`,
      );
      for (const q of queries) {
        expect(q).not.toContain(`&`);
        expect(q).not.toContain(`(`);
      }
    });
  });

  describe(`search`, () => {
    it(`should return error when API call fails (no real token)`, async () => {
      // Use a single query to minimize retries (3 attempts × 1 query)
      const result = await client.search([`test`]);
      // With a fake token the API should reject — we expect an err result
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBeDefined();
      }
    }, 30000); // Allow time for 3 retry attempts with backoff
  });
});
