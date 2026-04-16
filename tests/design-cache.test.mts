import { describe, expect, it, beforeAll, afterAll } from 'bun:test';
import { createLogger, transports } from 'winston';
import { rm } from 'node:fs/promises';
import { Workspace } from '../src/io/workspace.mts';
import type { DribbbleDesign, StitchDesign } from '../src/types/index.mts';

const silentLogger = createLogger({ silent: true, transports: [new transports.Console()] });
const testDir = `.workspace-design-cache-test`;

describe(`Workspace design cache`, () => {
  const workspace = new Workspace(testDir, silentLogger);
  const runId = `test-run-cache`;

  beforeAll(async () => {
    await workspace.init(runId);
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  const sampleDribbbleDesigns: DribbbleDesign[] = [
    {
      title: `Dashboard UI`,
      url: `https://dribbble.com/shots/12345`,
      imageUrl: `https://cdn.dribbble.com/img.jpg`,
      author: `Designer`,
      description: `A dashboard design`,
      tags: [`dashboard`, `ui`],
    },
    {
      title: `Admin Panel`,
      url: `https://dribbble.com/shots/67890`,
      imageUrl: `https://cdn.dribbble.com/img2.jpg`,
      author: `Designer2`,
      description: `An admin panel`,
      tags: [`admin`, `panel`],
    },
  ];

  const sampleStitchDesigns: StitchDesign[] = [
    {
      id: `stitch-001`,
      name: `Clean Minimal`,
      previewUrl: `https://stitch.withgoogle.com/projects/abc`,
      editUrl: `https://stitch.withgoogle.com/projects/abc/edit`,
      thumbnailDataUri: ``,
      description: `A clean minimal design`,
    },
  ];

  describe(`Dribbble cache`, () => {
    it(`should return null for non-existent cache key`, async () => {
      const result = await workspace.loadCachedDribbbleDesigns(`nonexistent`);
      expect(result).toBeNull();
    });

    it(`should save and load cached Dribbble designs`, async () => {
      await workspace.saveCachedDribbbleDesigns(`test-key-1`, sampleDribbbleDesigns);
      const loaded = await workspace.loadCachedDribbbleDesigns(`test-key-1`);

      expect(loaded).not.toBeNull();
      expect(loaded!.length).toBe(2);
      expect(loaded![0]!.title).toBe(`Dashboard UI`);
      expect(loaded![1]!.url).toBe(`https://dribbble.com/shots/67890`);
    });

    it(`should overwrite existing cache`, async () => {
      await workspace.saveCachedDribbbleDesigns(`test-key-1`, [sampleDribbbleDesigns[0]!]);
      const loaded = await workspace.loadCachedDribbbleDesigns(`test-key-1`);

      expect(loaded!.length).toBe(1);
    });
  });

  describe(`Stitch cache`, () => {
    it(`should return null for non-existent cache key`, async () => {
      const result = await workspace.loadCachedStitchDesigns(`nonexistent`);
      expect(result).toBeNull();
    });

    it(`should save and load cached Stitch designs`, async () => {
      await workspace.saveCachedStitchDesigns(`test-key-2`, sampleStitchDesigns);
      const loaded = await workspace.loadCachedStitchDesigns(`test-key-2`);

      expect(loaded).not.toBeNull();
      expect(loaded!.length).toBe(1);
      expect(loaded![0]!.name).toBe(`Clean Minimal`);
      expect(loaded![0]!.previewUrl).toContain(`stitch.withgoogle.com`);
    });
  });
});
