#!/usr/bin/env bun
// One command runs Stage A + B + C for an example id.
// Exits non-zero if any region fails the pixel-mismatch threshold.
// KB §3 — skipping any stage is how visual-fidelity misses ship.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const exampleId = process.argv[2] ?? `full-stack-dashboard`;
const url = process.argv[3] ?? `http://localhost:4200/dashboard`;
// Hard rule — pass threshold is 10% pixel mismatch. Overridable via arg 4 but the
// default is authoritative and documented in docs/ui-plan/03-visual-validation.md §6.
const thresholdRatio = Number(process.argv[4] ?? 0.10);
const antialiasTolerance = 0.3;

interface RegionEntry {

  readonly id: string;
  readonly bbox: readonly [number, number, number, number];
  readonly mask?: boolean;
  readonly prototype?: boolean;
}

interface RegionsFile {

  readonly regions: readonly RegionEntry[];
}

interface ReportRow {

  readonly id: string;
  readonly baselineSize: readonly [number, number];
  readonly actualSize: readonly [number, number];
  readonly mismatchedPixels: number;
  readonly mismatchRatio: number;
  readonly pass: boolean;
  readonly reason: string;
}

const run = (cmd: string, args: readonly string[]): number => {
  console.log(`\n→ ${cmd} ${args.join(` `)}`);
  const r = spawnSync(cmd, args as string[], { stdio: `inherit`, shell: false });
  return r.status ?? 1;
};

console.log(`=== STAGE A: baseline capture ===`);
if (run(`bun`, [`run`, `scripts/capture-before.mts`, exampleId]) !== 0) process.exit(2);

console.log(`\n=== STAGE B: live app capture (via node) ===`);
if (run(`node`, [`--experimental-strip-types`, `scripts/capture-after.mts`, url, exampleId]) !== 0) process.exit(3);

console.log(`\n=== STAGE C: per-region diff ===`);
const baselineDir = join(`visual-baselines`, exampleId);
const actualDir = join(`visual-actual`, exampleId);
const reportDir = join(`visual-report`, exampleId);
mkdirSync(reportDir, { recursive: true });

const regionsPath = join(`docs`, `ui-plan`, `examples`, exampleId, `regions.json`);
const regions = (JSON.parse(readFileSync(regionsPath, `utf8`)) as RegionsFile).regions;

// only diff regions for which we captured an 'actual' PNG
const actualFiles = new Set(readdirSync(actualDir).filter((f) => f.endsWith(`.png`)).map((f) => f.replace(/\.png$/, ``)));

const report: ReportRow[] = [];

for (const r of regions) {
  if (!actualFiles.has(r.id)) continue;
  const baselinePath = join(baselineDir, `${r.id}.png`);
  const actualPath = join(actualDir, `${r.id}.png`);
  if (!existsSync(baselinePath) || !existsSync(actualPath)) continue;

  const base = PNG.sync.read(readFileSync(baselinePath));
  const act = PNG.sync.read(readFileSync(actualPath));

  let compared: PNG;
  let reason = `identical-size`;
  if (base.width !== act.width || base.height !== act.height) {
    reason = `size-mismatch-resized`;
    compared = new PNG({ width: base.width, height: base.height });
    for (let y = 0; y < base.height; y++) {
      for (let x = 0; x < base.width; x++) {
        const sx = Math.floor((x / base.width) * act.width);
        const sy = Math.floor((y / base.height) * act.height);
        const si = (sy * act.width + sx) * 4;
        const di = (y * base.width + x) * 4;
        compared.data[di] = act.data[si] ?? 0;
        compared.data[di + 1] = act.data[si + 1] ?? 0;
        compared.data[di + 2] = act.data[si + 2] ?? 0;
        compared.data[di + 3] = act.data[si + 3] ?? 255;
      }
    }
  } else {
    compared = act;
  }

  const diff = new PNG({ width: base.width, height: base.height });
  const mismatched = pixelmatch(base.data, compared.data, diff.data, base.width, base.height, { threshold: antialiasTolerance });
  const total = base.width * base.height;
  const ratio = mismatched / total;
  const pass = ratio <= thresholdRatio;

  const diffOut = join(reportDir, `${r.id}.diff.png`);
  writeFileSync(diffOut, PNG.sync.write(diff));

  report.push({
    id: r.id,
    baselineSize: [base.width, base.height],
    actualSize: [act.width, act.height],
    mismatchedPixels: mismatched,
    mismatchRatio: ratio,
    pass,
    reason,
  });
}

writeFileSync(join(reportDir, `summary.json`), JSON.stringify({ exampleId, thresholdRatio, rows: report }, null, 2));

const failed = report.filter((r) => !r.pass);
console.log(`\n=== REPORT ===`);
console.log(`id`.padEnd(32) + ` | baseline | actual   | mismatch | pass`);
console.log(`-`.repeat(88));
for (const r of report) {
  const base = `${r.baselineSize[0]}x${r.baselineSize[1]}`.padEnd(8);
  const act = `${r.actualSize[0]}x${r.actualSize[1]}`.padEnd(8);
  const pct = (r.mismatchRatio * 100).toFixed(2) + `%`;
  const mark = r.pass ? `✓` : `✗`;
  console.log(`${r.id.padEnd(32)} | ${base} | ${act} | ${pct.padStart(7)} | ${mark}`);
}
console.log(`\n${report.length - failed.length}/${report.length} regions pass (threshold ${(thresholdRatio * 100).toFixed(2)}%).`);
console.log(`report: ${join(reportDir, `summary.json`)}`);

if (failed.length > 0) process.exit(1);
