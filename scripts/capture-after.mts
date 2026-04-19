#!/usr/bin/env bun
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
const url = args[0] ?? `http://localhost:4200/atoms`;
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

const locators: Array<{ id: string; sel: string }> = [
  { id: `alarm-stats`,        sel: `[data-visual-id="alarm-stats"]` },
  { id: `alarm-stats.online`, sel: `[data-visual-id="alarm-stats.online"]` },
  { id: `alarm-stats.alarms`, sel: `[data-visual-id="alarm-stats.alarms"]` },
  { id: `alarm-stats.sla`,    sel: `[data-visual-id="alarm-stats.sla"]` },
];

for (const { id, sel } of locators) {
  const el = page.locator(sel).first();
  await el.waitFor({ state: `visible`, timeout: 5000 });
  const outPath = join(outRoot, `${id}.png`);
  mkdirSync(dirname(outPath), { recursive: true });
  await el.screenshot({ path: outPath });
  console.log(`✓ ${id}  →  ${outPath}`);
}

// Full-page viewport capture for reference
const fullPath = join(outRoot, `_page.png`);
await page.screenshot({ path: fullPath, fullPage: false });
console.log(`✓ _page  →  ${fullPath}`);

await browser.close();
