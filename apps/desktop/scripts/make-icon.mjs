import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
// Renders build/icon.png (1024×1024) without native dependencies: a Dark
// Green+ rounded square with a terminal-style prompt (">_") in the accent
// colours the web app uses. electron-builder converts it to .icns on macOS.
// Re-run with `npm run icon` after editing.
import { deflateSync } from "node:zlib";

const SIZE = 1024;
const out = resolve(import.meta.dirname, "../build/icon.png");

const hex = (value) =>
  [1, 3, 5].map((i) => Number.parseInt(value.slice(i, i + 2), 16));
const CANVAS = hex("#0b140b");
const CANVAS_EDGE = hex("#141d14");
const LINE = hex("#0e9c2d");
const ACCENT = hex("#0ab320");
const CARET = hex("#00ff00");

function sdRoundBox(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - hw + r;
  const qy = Math.abs(py - cy) - hh + r;
  return (
    Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
    Math.min(Math.max(qx, qy), 0) -
    r
  );
}

function sdSegment(px, py, ax, ay, bx, by) {
  const pax = px - ax;
  const pay = py - ay;
  const bax = bx - ax;
  const bay = by - ay;
  const h = Math.min(
    Math.max((pax * bax + pay * bay) / (bax * bax + bay * bay), 0),
    1
  );
  return Math.hypot(pax - bax * h, pay - bay * h);
}

const coverage = (d) => Math.min(Math.max(0.5 - d, 0), 1);

function blend(dst, src, a) {
  dst[0] += (src[0] - dst[0]) * a;
  dst[1] += (src[1] - dst[1]) * a;
  dst[2] += (src[2] - dst[2]) * a;
  dst[3] += (1 - dst[3]) * a;
}

// macOS icon grid: artwork occupies ~82% of the canvas with ~22% corner radius.
const half = SIZE * 0.41;
const radius = half * 0.45;
const center = SIZE / 2;
const stroke = SIZE * 0.075;
const chevron = [
  [center - 0.2 * SIZE, center - 0.19 * SIZE],
  [center + 0.02 * SIZE, center],
  [center - 0.2 * SIZE, center + 0.19 * SIZE],
];
const caret = [
  [center + 0.09 * SIZE, center + 0.19 * SIZE],
  [center + 0.3 * SIZE, center + 0.19 * SIZE],
];

const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0; // PNG filter: none
  for (let x = 0; x < SIZE; x++) {
    const px = x + 0.5;
    const py = y + 0.5;
    const pixel = [0, 0, 0, 0];

    const dBox = sdRoundBox(px, py, center, center, half, half, radius);
    if (dBox < 1) {
      const t = Math.min(Math.max((py - (center - half)) / (2 * half), 0), 1);
      const bg = [0, 1, 2].map(
        (i) => CANVAS_EDGE[i] + (CANVAS[i] - CANVAS_EDGE[i]) * t
      );
      blend(pixel, bg, coverage(dBox));
      // hairline in the accent hue, like --line in the web theme
      const dEdge = Math.abs(dBox + SIZE * 0.012) - SIZE * 0.004;
      blend(pixel, LINE, coverage(dEdge) * 0.85);

      const dChevron =
        Math.min(
          sdSegment(px, py, ...chevron[0], ...chevron[1]),
          sdSegment(px, py, ...chevron[1], ...chevron[2])
        ) -
        stroke / 2;
      blend(pixel, ACCENT, coverage(dChevron));

      const dCaret = sdSegment(px, py, ...caret[0], ...caret[1]) - stroke / 2;
      blend(pixel, CARET, coverage(dCaret));
    }

    const offset = y * (SIZE * 4 + 1) + 1 + x * 4;
    raw[offset] = Math.round(pixel[0]);
    raw[offset + 1] = Math.round(pixel[1]);
    raw[offset + 2] = Math.round(pixel[2]);
    raw[offset + 3] = Math.round(pixel[3] * 255);
  }
}

const crcTable = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c;
});
function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}
function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, png);
console.log(`wrote ${out} (${png.length} bytes)`);
