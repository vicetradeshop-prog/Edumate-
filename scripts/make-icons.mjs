#!/usr/bin/env node
/**
 * EduMate — Génère les icônes PNG (public/icon-192.png, public/icon-512.png).
 *
 * 100 % Node, sans dépendance : écrit un PNG (zlib + CRC) à partir d'un dessin
 * vectoriel rasterisé (dégradé violet→cyan, hibou stylisé).
 *
 * Usage : npm run icons
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

/* ------------------------------- PNG ---------------------------------- */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

function writePng(file, size, pixelAt) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  let offset = 0;
  for (let y = 0; y < size; y += 1) {
    raw[offset++] = 0; // filtre « none »
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = pixelAt(x, y);
      raw[offset++] = r;
      raw[offset++] = g;
      raw[offset++] = b;
      raw[offset++] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // profondeur
  ihdr[9] = 6; // RGBA
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(file, png);
  console.log(`✅ ${path.basename(file)} (${size}×${size})`);
}

/* ------------------------------- Dessin -------------------------------- */
const TOP = [108, 92, 231]; // #6c5ce7
const BOTTOM = [34, 211, 238]; // #22d3ee

function insideRoundedRect(x, y, size, radius) {
  const r = radius;
  if (x < r && y < r) return (x - r) ** 2 + (y - r) ** 2 <= r * r;
  if (x > size - 1 - r && y < r) return (x - (size - 1 - r)) ** 2 + (y - r) ** 2 <= r * r;
  if (x < r && y > size - 1 - r) return (x - r) ** 2 + (y - (size - 1 - r)) ** 2 <= r * r;
  if (x > size - 1 - r && y > size - 1 - r) return (x - (size - 1 - r)) ** 2 + (y - (size - 1 - r)) ** 2 <= r * r;
  return true;
}

function disc(x, y, cx, cy, r) {
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function ring(x, y, cx, cy, r, thickness) {
  const d2 = (x - cx) ** 2 + (y - cy) ** 2;
  return d2 <= r * r && d2 >= (r - thickness) ** 2;
}

function triangle(x, y, ax, ay, bx, by, cx, cy) {
  const sign = (px, py, x1, y1, x2, y2) => (px - x2) * (y1 - y2) - (x1 - x2) * (py - y2);
  const d1 = sign(x, y, ax, ay, bx, by);
  const d2 = sign(x, y, bx, by, cx, cy);
  const d3 = sign(x, y, cx, cy, ax, ay);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

function pixelAtFactory(size) {
  const radius = size * 0.25;
  const eyeR = size * 0.135;
  const eyeY = size * 0.44;
  const eyeDx = size * 0.135;
  const pupilR = eyeR * 0.62;
  const beakW = size * 0.075;
  const beakTop = size * 0.575;
  const beakBottom = beakTop + size * 0.075;

  return (x, y) => {
    if (!insideRoundedRect(x, y, size, radius)) return [0, 0, 0, 0];

    // Dégradé vertical de fond
    const t = y / Math.max(1, size - 1);
    let r = Math.round(TOP[0] + (BOTTOM[0] - TOP[0]) * t);
    let g = Math.round(TOP[1] + (BOTTOM[1] - TOP[1]) * t);
    let b = Math.round(TOP[2] + (BOTTOM[2] - TOP[2]) * t);
    let a = 255;

    const cx = size / 2;

    // Yeux blancs
    if (disc(x, y, cx - eyeDx, eyeY, eyeR) || disc(x, y, cx + eyeDx, eyeY, eyeR)) {
      return [255, 255, 255, 255];
    }
    // Pupilles
    if (disc(x, y, cx - eyeDx, eyeY + eyeR * 0.06, pupilR) || disc(x, y, cx + eyeDx, eyeY + eyeR * 0.06, pupilR)) {
      // Reflet
      if (disc(x, y, cx - eyeDx - pupilR * 0.35, eyeY - pupilR * 0.5, pupilR * 0.22)) return [255, 255, 255, 235];
      if (disc(x, y, cx + eyeDx - pupilR * 0.35, eyeY - pupilR * 0.5, pupilR * 0.22)) return [255, 255, 255, 235];
      return [47, 42, 85, 255];
    }
    // Bec
    if (triangle(x, y, cx - beakW, beakTop, cx + beakW, beakTop, cx, beakBottom)) {
      return [255, 209, 102, 255];
    }
    // Capuchon (arc au-dessus des yeux)
    if (ring(x, y, cx, size * 0.39, size * 0.27, size * 0.035) && y < size * 0.39) {
      return [255, 255, 255, 90];
    }
    return [r, g, b, a];
  };
}

fs.mkdirSync(outDir, { recursive: true });
writePng(path.join(outDir, 'icon-192.png'), 192, pixelAtFactory(192));
writePng(path.join(outDir, 'icon-512.png'), 512, pixelAtFactory(512));
