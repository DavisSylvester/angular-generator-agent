#!/usr/bin/env bun
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const src = PNG.sync.read(readFileSync(`docs/ui-plan/examples/full-stack-dashboard/reference.png`));
const { width, height, data } = src;

const brightness = (x: number, y: number): number => {
  const i = (y * width + x) * 4;
  return (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
};

const columnMeanBrightness = (x: number, yStart: number, yEnd: number): number => {
  let sum = 0;
  let n = 0;
  for (let y = yStart; y < yEnd; y++) {
    sum += brightness(x, y);
    n++;
  }
  return sum / n;
};

const rowMeanBrightness = (y: number, xStart: number, xEnd: number): number => {
  let sum = 0;
  let n = 0;
  for (let x = xStart; x < xEnd; x++) {
    sum += brightness(x, y);
    n++;
  }
  return sum / n;
};

const findGutters = (
  meansAxis: 'col' | 'row',
  scan: [number, number],
  perpendicular: [number, number],
  darkThreshold: number,
  minWidth: number,
): Array<[number, number]> => {
  const [aStart, aEnd] = scan;
  const [pStart, pEnd] = perpendicular;
  const gutters: Array<[number, number]> = [];
  let inGutter = false;
  let start = 0;
  for (let a = aStart; a < aEnd; a++) {
    const m =
      meansAxis === 'col'
        ? columnMeanBrightness(a, pStart, pEnd)
        : rowMeanBrightness(a, pStart, pEnd);
    const isDark = m < darkThreshold;
    if (isDark && !inGutter) {
      inGutter = true;
      start = a;
    } else if (!isDark && inGutter) {
      inGutter = false;
      if (a - start >= minWidth) gutters.push([start, a]);
    }
  }
  if (inGutter && aEnd - start >= minWidth) gutters.push([start, aEnd]);
  return gutters;
};

console.log(`image: ${width}x${height}`);

console.log(`\nfine-grained column brightness (every 5px, y=260-520):`);
const colMeans: number[] = [];
for (let x = 0; x < width; x++) {
  colMeans.push(columnMeanBrightness(x, 260, 520));
}
const colMax = Math.max(...colMeans);
const colMin = Math.min(...colMeans);
console.log(`  col brightness range: ${colMin.toFixed(1)} .. ${colMax.toFixed(1)}`);

console.log(`\nbright local peaks (border candidates, y=260-520 band, value > ${(colMax * 0.7).toFixed(1)}):`);
for (let x = 1; x < width - 1; x++) {
  const v = colMeans[x]!;
  const l = colMeans[x - 1]!;
  const r = colMeans[x + 1]!;
  if (v > colMax * 0.7 && v >= l && v >= r) {
    console.log(`  x=${x.toString().padStart(4)}  brightness=${v.toFixed(1)}`);
  }
}

console.log(`\nrow brightness band (x=60-1870, y=100-900):`);
const rowMeans: number[] = [];
for (let y = 100; y < 900; y++) {
  rowMeans.push(rowMeanBrightness(y, 60, 1870));
}
const rowMax = Math.max(...rowMeans);
console.log(`  row brightness range: ${Math.min(...rowMeans).toFixed(1)} .. ${rowMax.toFixed(1)}`);
console.log(`\nbright local peaks (horizontal borders):`);
for (let y = 1; y < rowMeans.length - 1; y++) {
  const v = rowMeans[y]!;
  const l = rowMeans[y - 1]!;
  const r = rowMeans[y + 1]!;
  if (v > rowMax * 0.75 && v >= l && v >= r) {
    console.log(`  y=${(y + 100).toString().padStart(4)}  brightness=${v.toFixed(1)}`);
  }
}

const topRowY: [number, number] = [310, 500];
const bottomRowY: [number, number] = [630, 880];

const colGuttersTop = findGutters('col', [0, width], topRowY, 14, 6);
const colGuttersBot = findGutters('col', [0, width], bottomRowY, 14, 6);

console.log(`\ncolumn gutters (top row y=${topRowY[0]}-${topRowY[1]}):`);
for (const [s, e] of colGuttersTop) console.log(`  x=${s}-${e}  (width ${e - s})`);

console.log(`\ncolumn gutters (bottom row y=${bottomRowY[0]}-${bottomRowY[1]}):`);
for (const [s, e] of colGuttersBot) console.log(`  x=${s}-${e}  (width ${e - s})`);

const rowGuttersLeft = findGutters('row', [140, height], [60, 500], 14, 6);
const rowGuttersMid = findGutters('row', [140, height], [650, 1090], 14, 6);
const rowGuttersRight = findGutters('row', [140, height], [1150, 1870], 14, 6);

console.log(`\nrow gutters (left col x=60-500):`);
for (const [s, e] of rowGuttersLeft) console.log(`  y=${s}-${e}  (width ${e - s})`);

console.log(`\nrow gutters (mid col x=650-1090):`);
for (const [s, e] of rowGuttersMid) console.log(`  y=${s}-${e}  (width ${e - s})`);

console.log(`\nrow gutters (right col x=1150-1870):`);
for (const [s, e] of rowGuttersRight) console.log(`  y=${s}-${e}  (width ${e - s})`);
