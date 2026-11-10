/**
 * Generates HoldProof's icon and splash PNGs with no dependencies (Node zlib only).
 * Mark: an amber "hold" ring closed by a white check, on deep ink.
 * Run: node scripts/generate-icons.js
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const INK = [14, 26, 43];
const AMBER = [232, 163, 61];
const WHITE = [255, 255, 255];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x + 0.5, y + 0.5, size);
      const i = y * (size * 4 + 1) + 1 + x * 4;
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; raw[i + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

const clamp = (v) => Math.max(0, Math.min(1, v));
function over(dst, src, a) {
  return [0, 1, 2].map((i) => Math.round(dst[i] * (1 - a) + src[i] * a));
}

/** Returns coverage of [ring, check] for a symbol scaled to `scale` of the canvas. */
function symbol(x, y, size, scale) {
  const c = size / 2;
  const u = (size * scale) / 2; // symbol radius unit
  const nx = (x - c) / u, ny = (y - c) / u; // normalised -1..1
  const px = 1 / u; // one pixel in normalised units (anti-aliasing width)
  const r = Math.hypot(nx, ny);
  // Ring with a gap at the upper right (the "hold" being closed by the check).
  const ringDist = Math.abs(r - 0.82) - 0.11;
  const angle = Math.atan2(ny, nx); // -pi..pi, 0 = right
  const inGap = angle > -1.25 && angle < -0.35;
  const ring = inGap ? 0 : clamp(0.5 - ringDist / px);
  // Check mark.
  const d = Math.min(distToSegment(nx, ny, -0.42, 0.02, -0.12, 0.32), distToSegment(nx, ny, -0.12, 0.32, 0.62, -0.5));
  const check = clamp(0.5 - (d - 0.11) / px);
  return [ring, check];
}

function make(size, { bg, scale, ringColor = AMBER, checkColor = WHITE, mono = false }) {
  return png(size, (x, y) => {
    const [ring, check] = symbol(x, y, size, scale);
    if (mono) {
      const a = Math.max(ring, check);
      return [255, 255, 255, Math.round(a * 255)];
    }
    if (!bg) {
      const a = Math.max(ring, check);
      const col = check >= ring ? checkColor : ringColor;
      return [...col, Math.round(a * 255)];
    }
    let col = bg;
    col = over(col, ringColor, ring);
    col = over(col, checkColor, check);
    return [...col, 255];
  });
}

const out = path.join(__dirname, '..', 'assets');
const files = {
  'icon.png': make(1024, { bg: INK, scale: 0.62 }),
  'android-icon-foreground.png': make(1024, { bg: null, scale: 0.42 }),
  'android-icon-background.png': png(1024, () => [...INK, 255]),
  'android-icon-monochrome.png': make(1024, { bg: null, scale: 0.42, mono: true }),
  'splash-icon.png': make(512, { bg: null, scale: 0.9 }),
  'favicon.png': make(48, { bg: INK, scale: 0.7 }),
};
for (const [name, data] of Object.entries(files)) {
  fs.writeFileSync(path.join(out, name), data);
  console.log(`wrote assets/${name} (${data.length} bytes)`);
}
