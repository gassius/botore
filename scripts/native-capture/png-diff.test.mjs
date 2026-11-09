/**
 * Unit tests for PNG decode / diff / SpringBoard heuristic (C7b PRR P3).
 * Run: node --test scripts/native-capture/png-diff.test.mjs
 */
import { deflateSync } from 'node:zlib';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  decodePngRgba,
  looksLikeSpringBoardOpenDialog,
  pixelDiffPct,
  graphiteShare,
} from './png-diff.mjs';

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/** Tiny solid-color 8-bit RGBA PNG. */
function solidPng(w, h, rgba) {
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter None
    for (let x = 0; x < w; x++) {
      const i = y * (stride + 1) + 1 + x * 4;
      raw[i] = rgba[0];
      raw[i + 1] = rgba[1];
      raw[i + 2] = rgba[2];
      raw[i + 3] = rgba[3] ?? 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

test('identical PNGs have 0% pixel diff', () => {
  const a = decodePngRgba(solidPng(8, 8, [0xf4, 0xe4, 0xc8]));
  const b = decodePngRgba(solidPng(8, 8, [0xf4, 0xe4, 0xc8]));
  assert.equal(pixelDiffPct(a, b), 0);
});

test('near-identical size mismatch reports 100%', () => {
  const a = decodePngRgba(solidPng(8, 8, [0, 0, 0]));
  const b = decodePngRgba(solidPng(8, 4, [0, 0, 0]));
  assert.equal(pixelDiffPct(a, b), 100);
});

test('different solid colors differ fully', () => {
  const a = decodePngRgba(solidPng(4, 4, [0x30, 0x2d, 0x27]));
  const b = decodePngRgba(solidPng(4, 4, [0xf4, 0xe4, 0xc8]));
  assert.ok(pixelDiffPct(a, b) > 99);
});

test('SpringBoard heuristic needs a blue-majority grid, not one petrol pixel', () => {
  // Cream garage-like frame must not trip the dialog check.
  const cream = decodePngRgba(solidPng(32, 64, [0xf4, 0xe4, 0xc8]));
  assert.equal(looksLikeSpringBoardOpenDialog(cream), false);

  // Full blue wallpaper-like frame should trip it.
  const blue = decodePngRgba(solidPng(32, 64, [0x40, 0x80, 0xe0]));
  assert.equal(looksLikeSpringBoardOpenDialog(blue), true);
});

test('graphiteShare is high for #302D27 splash', () => {
  const splash = decodePngRgba(solidPng(16, 16, [0x30, 0x2d, 0x27]));
  assert.ok(graphiteShare(splash) > 0.9);
  const cream = decodePngRgba(solidPng(16, 16, [0xf4, 0xe4, 0xc8]));
  assert.ok(graphiteShare(cream) < 0.1);
});
