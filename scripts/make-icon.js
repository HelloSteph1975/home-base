'use strict';
// Draws the house from public/icon.svg into windows/home-base.ico: one 64x64
// 32-bit image, 4x4 supersampled. No dependencies.
const fs = require('node:fs');
const path = require('node:path');

const SIZE = 64;
const SS = 4;
const CREAM = [250, 245, 236];
const INK = [181, 85, 47];
const SEGMENTS = [[12, 30, 32, 13], [32, 13, 52, 30], [18, 27, 18, 49], [18, 49, 46, 49], [46, 49, 46, 27]];

function inRoundedSquare(x, y) {
  const r = 14;
  const cx = Math.min(Math.max(x, r), SIZE - r);
  const cy = Math.min(Math.max(y, r), SIZE - r);
  return x >= 0 && y >= 0 && x <= SIZE && y <= SIZE && (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function distToSegment(px, py, [x1, y1, x2, y2]) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function colorAt(x, y) {
  if (!inRoundedSquare(x, y)) return null;
  const ink = SEGMENTS.some((s) => distToSegment(x, y, s) <= 2.5) || (x >= 28 && x <= 36 && y >= 36 && y <= 49);
  return ink ? INK : CREAM;
}

const pixels = Buffer.alloc(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y += 1) {
  for (let x = 0; x < SIZE; x += 1) {
    let r = 0; let g = 0; let b = 0; let hits = 0;
    for (let sy = 0; sy < SS; sy += 1) {
      for (let sx = 0; sx < SS; sx += 1) {
        const c = colorAt(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS);
        if (c) { r += c[0]; g += c[1]; b += c[2]; hits += 1; }
      }
    }
    const i = ((SIZE - 1 - y) * SIZE + x) * 4; // BMP rows run bottom-up
    if (hits) {
      pixels[i] = Math.round(b / hits);
      pixels[i + 1] = Math.round(g / hits);
      pixels[i + 2] = Math.round(r / hits);
      pixels[i + 3] = Math.round((255 * hits) / (SS * SS));
    }
  }
}

const header = Buffer.alloc(40);
header.writeUInt32LE(40, 0);
header.writeInt32LE(SIZE, 4);
header.writeInt32LE(SIZE * 2, 8); // ICO bitmaps count the mask in the height
header.writeUInt16LE(1, 12);
header.writeUInt16LE(32, 14);
header.writeUInt32LE(pixels.length, 20);
const mask = Buffer.alloc((SIZE / 8) * SIZE); // all zero: the alpha channel decides
const image = Buffer.concat([header, pixels, mask]);

const dir = Buffer.alloc(6);
dir.writeUInt16LE(0, 0);
dir.writeUInt16LE(1, 2);
dir.writeUInt16LE(1, 4);
const entry = Buffer.alloc(16);
entry.writeUInt8(SIZE, 0);
entry.writeUInt8(SIZE, 1);
entry.writeUInt16LE(1, 4);
entry.writeUInt16LE(32, 6);
entry.writeUInt32LE(image.length, 8);
entry.writeUInt32LE(dir.length + entry.length, 12);

const out = path.join(__dirname, '..', 'windows', 'home-base.ico');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.concat([dir, entry, image]));
console.log(`Wrote ${out}`);
