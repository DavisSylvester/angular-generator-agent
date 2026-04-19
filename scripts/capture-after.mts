#!/usr/bin/env bun
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
const url = args[0] ?? `http://localhost:4200/dashboard`;
const exampleId = args[1] ?? `full-stack-dashboard`;

const outRoot = join(`visual-actual`, exampleId);
mkdirSync(outRoot, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1905, height: 953 },
  deviceScaleFactor: 1,
  reducedMotion: `reduce`,
  colorScheme: `dark`,
});
const page = await context.newPage();
await page.goto(url, { waitUntil: `networkidle` });

// Dynamically read regions.json so capture tracks the decomposition.
import { readFileSync } from 'node:fs';
const regionsFile = JSON.parse(readFileSync(`docs/ui-plan/examples/${exampleId}/regions.json`, `utf8`)) as { regions: Array<{ id: string }> };

for (const r of regionsFile.regions) {
  const sel = `[data-visual-id="${r.id}"]`;
  const el = page.locator(sel).first();
  try {
    await el.waitFor({ state: `visible`, timeout: 3000 });
  } catch {
    console.log(`✗ ${r.id}  (not found, skipping)`);
    continue;
  }
  const outPath = join(outRoot, `${r.id}.png`);
  mkdirSync(dirname(outPath), { recursive: true });
  try {
    await el.screenshot({ path: outPath });
    console.log(`✓ ${r.id}  →  ${outPath}`);
  } catch (e) {
    console.log(`✗ ${r.id}  (screenshot failed: ${(e as Error).message.slice(0, 60)})`);
  }
}

// Full-page viewport capture for reference
const fullPath = join(outRoot, `_page.png`);
await page.screenshot({ path: fullPath, fullPage: false });
console.log(`✓ _page  →  ${fullPath}`);

await browser.close();
