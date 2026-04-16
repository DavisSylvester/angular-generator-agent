import { describe, expect, it } from 'bun:test';
import { createLogger, transports } from 'winston';
import { DribbbleScraper } from '../src/services/dribbble-scraper.mts';

const silentLogger = createLogger({ silent: true, transports: [new transports.Console()] });

describe(`DribbbleScraper`, () => {
  const scraper = new DribbbleScraper(silentLogger, 5);

  describe(`buildSearchQueries`, () => {
    it(`should generate multiple query variants`, () => {
      const queries = scraper.buildSearchQueries(
        `Subcontractor Portal`,
        `Managing subcontractors and compliance`,
      );
      expect(queries.length).toBeGreaterThanOrEqual(3);
      expect(queries.some((q) => q.includes(`subcontractor`))).toBe(true);
    });

    it(`should strip special characters from queries`, () => {
      const queries = scraper.buildSearchQueries(
        `Test & Project (v2)`,
        `Scope: something!`,
      );
      for (const q of queries) {
        expect(q).not.toContain(`&`);
        expect(q).not.toContain(`(`);
      }
    });
  });

  describe(`parseSnapshot`, () => {
    it(`should extract designs from snapshot text with shot links`, () => {
      const snapshot = [
        `  link "Cool Dashboard Design" url: https://dribbble.com/shots/12345-cool-dashboard`,
        `  img "thumbnail" url: https://cdn.dribbble.com/thumb.jpg`,
        `  link "DesignerName" url: https://dribbble.com/designername`,
        `  link "Admin Panel UI" url: https://dribbble.com/shots/67890-admin-panel`,
        `  img "thumb2" url: https://cdn.dribbble.com/thumb2.jpg`,
      ].join(`\n`);

      const designs = scraper.parseSnapshot(snapshot, `dashboard`);
      expect(designs.length).toBeGreaterThanOrEqual(1);
    });

    it(`should return empty array for non-matching snapshot`, () => {
      const designs = scraper.parseSnapshot(`just some random text`, `test`);
      expect(designs).toEqual([]);
    });
  });
});
