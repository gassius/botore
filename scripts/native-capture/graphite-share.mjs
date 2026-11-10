#!/usr/bin/env node
/**
 * Print graphiteShare (0..1) for a PNG path. Used by iOS cold-start capture to
 * discard SpringBoard frames until native splash #302D27 appears.
 *
 * Usage: node graphite-share.mjs <png>
 */
import { readFileSync } from 'node:fs';
import { decodePngRgba, graphiteShare } from './png-diff.mjs';

const file = process.argv[2];
if (!file) {
  console.error('usage: node graphite-share.mjs <png>');
  process.exit(2);
}
const img = decodePngRgba(readFileSync(file));
const g = graphiteShare(img);
process.stdout.write(`${g.toFixed(6)}\n`);
