#!/usr/bin/env bun
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const src = PNG.sync.read(readFileSync(`docs/ui-plan/examples/full-stack-dashboard/reference.png`));

const drawRect = (img: PNG, x: number, y: number, w: number, h: number, r: number, g: number, b: number): void => {
  const { width: iw, height: ih, data } = img;
  for (let dx = 0; dx < w; dx++) {
    for (const edgeY of [y, y + h - 1]) {
      if (edgeY < 0 || edgeY >= ih) continue;
      const px = x + dx;
      if (px < 0 || px >= iw) continue;
      const i = (edgeY * iw + px) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  for (let dy = 0; dy < h; dy++) {
    for (const edgeX of [x, x + w - 1]) {
      if (edgeX < 0 || edgeX >= iw) continue;
      const py = y + dy;
      if (py < 0 || py >= ih) continue;
      const i = (py * iw + edgeX) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
};

interface RegionsFile {

  readonly regions: Array<{ readonly id: string; readonly bbox: readonly [number, number, number, number] }>;
}

const regions = JSON.parse(readFileSync(`docs/ui-plan/examples/full-stack-dashboard/regions.json`, `utf8`)) as RegionsFile;

const annotated = new PNG({ width: src.width, height: src.height });
src.data.copy(annotated.data);

const topLevel = new Set(['model-render', 'health-monitor', 'runtime-metrics', 'active-nodes', 'alarm-stats', 'alarm-list', 'app-header', 'dashboard-page.tag']);

for (const r of regions.regions) {
  const [x, y, w, h] = r.bbox;
  if (r.id === 'page' || r.id === 'dashboard-page') continue;
  if (topLevel.has(r.id)) {
    drawRect(annotated, x, y, w, h, 255, 51, 85);
  } else if (r.id.includes('.')) {
    drawRect(annotated, x, y, w, h, 110, 231, 249);
  }
}

writeFileSync(`visual-baselines/full-stack-dashboard/_overlay.png`, PNG.sync.write(annotated));
console.log(`wrote visual-baselines/full-stack-dashboard/_overlay.png`);
