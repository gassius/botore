#!/usr/bin/env node
// Find a node in an `uiautomator dump` XML by accessibility label (content-desc)
// or visible text, and print its center (`x y`) or bounds (`x1 y1 x2 y2`).
//
//   node android-ui-find.mjs --xml /tmp/ui.xml --label "Watch again" [--bounds]
//
// Exit 1 when no node matches. Matching is exact (trimmed, case-insensitive);
// content-desc wins over text so RN Pressables resolve to their hit box.
import { readFileSync } from 'node:fs';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

export function findNodeBounds(xml, label) {
  const want = label.trim().toLowerCase();
  const nodes = [...xml.matchAll(/<node\b[^>]*>/g)].map((m) => m[0]);
  const attr = (node, key) => {
    const m = node.match(new RegExp(`\\b${key}="([^"]*)"`));
    return m
      ? m[1]
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .trim()
      : '';
  };
  const pick =
    nodes.find((n) => attr(n, 'content-desc').toLowerCase() === want) ??
    nodes.find((n) => attr(n, 'text').toLowerCase() === want);
  if (!pick) return null;
  const b = attr(pick, 'bounds').match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
  if (!b) return null;
  const [x1, y1, x2, y2] = b.slice(1).map(Number);
  return { x1, y1, x2, y2, cx: Math.round((x1 + x2) / 2), cy: Math.round((y1 + y2) / 2) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const xmlPath = arg('--xml');
  const label = arg('--label');
  if (!xmlPath || !label) {
    console.error('usage: android-ui-find.mjs --xml <dump.xml> --label <text> [--bounds]');
    process.exit(2);
  }
  const hit = findNodeBounds(readFileSync(xmlPath, 'utf8'), label);
  if (!hit) process.exit(1);
  console.log(
    process.argv.includes('--bounds')
      ? `${hit.x1} ${hit.y1} ${hit.x2} ${hit.y2}`
      : `${hit.cx} ${hit.cy}`,
  );
}
