import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { describe, it } from 'node:test';
import { analyzePngPaint, assertPaintNotBlank } from './capture-routes.mjs';

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/** Minimal 8×8 filter-0 RGB PNG filled with one colour. */
function solidRgbPng(r, g, b, size = 8) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const stride = size * 3;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (stride + 1);
    raw[row] = 0; // filter None
    for (let x = 0; x < size; x++) {
      const i = row + 1 + x * 3;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
    }
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Checkerboard → many colours. */
function checkerPng(size = 16) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const stride = size * 3;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (stride + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const i = row + 1 + x * 3;
      const v = (x * 17 + y * 31) & 0xff;
      raw[i] = v;
      raw[i + 1] = (v * 3) & 0xff;
      raw[i + 2] = (v * 7) & 0xff;
    }
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

describe('assertPaintNotBlank', () => {
  it('rejects near-uniform / inset-black stats', () => {
    assert.throws(
      () => assertPaintNotBlank({ unique: 1, dominantShare: 1, dominantHex: '#000000' }, 'Stable'),
      /near-uniform|inset colour/,
    );
    assert.throws(
      () =>
        assertPaintNotBlank({ unique: 10, dominantShare: 0.99, dominantHex: '#112233' }, 'Stable'),
      /near-uniform/,
    );
  });

  it('accepts diverse stats', () => {
    assert.doesNotThrow(() =>
      assertPaintNotBlank({ unique: 120, dominantShare: 0.35, dominantHex: '#f4f1ea' }, 'Stable'),
    );
  });
});

describe('analyzePngPaint', () => {
  it('flags solid black PNG as blank', () => {
    const stats = analyzePngPaint(solidRgbPng(0, 0, 0));
    assert.equal(stats.unique, 1);
    assert.equal(stats.dominantHex, '#000000');
    assert.equal(stats.dominantShare, 1);
    assert.throws(() => assertPaintNotBlank(stats, 'Stable'), /near-uniform|inset colour/);
  });

  it('accepts a varied checker PNG', () => {
    const stats = analyzePngPaint(checkerPng(32));
    assert.ok(stats.unique >= 50, `unique=${stats.unique}`);
    assert.ok(stats.dominantShare <= 0.98);
    assert.doesNotThrow(() => assertPaintNotBlank(stats, 'Stable'));
  });
});
