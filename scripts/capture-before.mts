#!/usr/bin/env bun
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { PNG } from 'pngjs';

interface Region {

  readonly id: string;
  readonly bbox: readonly [number, number, number, number];
  readonly mask?: boolean;
  readonly prototype?: boolean;
}

interface RegionsFile {

  readonly reference: string;
  readonly viewport: { readonly w: number; readonly h: number };
  readonly note?: string;
  readonly regions: readonly Region[];
}

interface ManifestEntry {

  readonly id: string;
  readonly bbox: readonly [number, number, number, number];
  readonly width: number;
  readonly height: number;
  readonly sha256: string;
  readonly mask: boolean;
  readonly prototype: boolean;
}

const args = Bun.argv.slice(2);
const exampleId = args[0];
if (!exampleId) {
  console.error(`usage: bun scripts/capture-before.mts <example-id>`);
  process.exit(1);
}

const exampleRoot = join(`docs`, `ui-plan`, `examples`, exampleId);
const regionsPath = join(exampleRoot, `regions.json`);
const referencePath = join(exampleRoot, `reference.png`);
const outRoot = join(`visual-baselines`, exampleId);

if (!existsSync(regionsPath)) {
  console.error(`missing: ${regionsPath}`);
  process.exit(1);
}
if (!existsSync(referencePath)) {
  console.error(`missing: ${referencePath}`);
  process.exit(1);
}

const regionsFile = JSON.parse(readFileSync(regionsPath, `utf8`)) as RegionsFile;
const sourceBuffer = readFileSync(referencePath);
const source = PNG.sync.read(sourceBuffer);

if (source.width !== regionsFile.viewport.w || source.height !== regionsFile.viewport.h) {
  console.warn(
    `viewport mismatch: regions.json declares ${regionsFile.viewport.w}x${regionsFile.viewport.h} ` +
    `but reference is ${source.width}x${source.height} — using reference dimensions`,
  );
}

const manifest: ManifestEntry[] = [];

for (const region of regionsFile.regions) {
  const [x, y, w, h] = region.bbox;
  if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > source.width || y + h > source.height) {
    console.error(`skipping ${region.id}: bbox ${region.bbox} out of bounds (${source.width}x${source.height})`);
    continue;
  }

  const cropped = new PNG({ width: w, height: h });
  PNG.bitblt(source, cropped, x, y, w, h, 0, 0);
  const outBytes = PNG.sync.write(cropped);
  const outPath = join(outRoot, `${region.id}.png`);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, outBytes);

  const sha = createHash(`sha256`).update(outBytes).digest(`hex`);
  manifest.push({
    id: region.id,
    bbox: region.bbox,
    width: w,
    height: h,
    sha256: sha,
    mask: region.mask ?? false,
    prototype: region.prototype ?? false,
  });
  console.log(`✓ ${region.id.padEnd(40)} ${w}x${h}  ${sha.slice(0, 8)}`);
}

const manifestPath = join(outRoot, `manifest.json`);
writeFileSync(manifestPath, JSON.stringify({ example: exampleId, generatedAt: new Date().toISOString(), entries: manifest }, null, 2));
console.log(`\nwrote ${manifest.length} baselines + manifest to ${outRoot}`);
