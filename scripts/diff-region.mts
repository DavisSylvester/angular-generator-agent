#!/usr/bin/env bun
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const id = Bun.argv[2] ?? `alarm-stats`;
const exampleId = Bun.argv[3] ?? `full-stack-dashboard`;

const baselinePath = `visual-baselines/${exampleId}/${id}.png`;
const actualPath = `visual-actual/${exampleId}/${id}.png`;
const diffPath = `visual-actual/${exampleId}/${id}.diff.png`;

const baseline = PNG.sync.read(readFileSync(baselinePath));
const actual = PNG.sync.read(readFileSync(actualPath));

if (baseline.width !== actual.width || baseline.height !== actual.height) {
  console.log(`size mismatch — baseline ${baseline.width}x${baseline.height} vs actual ${actual.width}x${actual.height}`);

  // Resize actual to match baseline for diff (nearest neighbor, crude but informative)
  const resized = new PNG({ width: baseline.width, height: baseline.height });
  for (let y = 0; y < baseline.height; y++) {
    for (let x = 0; x < baseline.width; x++) {
      const sx = Math.floor((x / baseline.width) * actual.width);
      const sy = Math.floor((y / baseline.height) * actual.height);
      const si = (sy * actual.width + sx) * 4;
      const di = (y * baseline.width + x) * 4;
      resized.data[di] = actual.data[si] ?? 0;
      resized.data[di + 1] = actual.data[si + 1] ?? 0;
      resized.data[di + 2] = actual.data[si + 2] ?? 0;
      resized.data[di + 3] = actual.data[si + 3] ?? 255;
    }
  }

  const diff = new PNG({ width: baseline.width, height: baseline.height });
  const mismatched = pixelmatch(baseline.data, resized.data, diff.data, baseline.width, baseline.height, { threshold: 0.1 });
  const total = baseline.width * baseline.height;
  writeFileSync(diffPath, PNG.sync.write(diff));
  console.log(`${id}  (after resize): ${mismatched} / ${total} pixels differ = ${((mismatched / total) * 100).toFixed(2)}%`);
} else {
  const diff = new PNG({ width: baseline.width, height: baseline.height });
  const mismatched = pixelmatch(baseline.data, actual.data, diff.data, baseline.width, baseline.height, { threshold: 0.1 });
  const total = baseline.width * baseline.height;
  writeFileSync(diffPath, PNG.sync.write(diff));
  console.log(`${id}: ${mismatched} / ${total} pixels differ = ${((mismatched / total) * 100).toFixed(2)}%`);
}
