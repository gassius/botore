/**
 * Unit tests for uiautomator dump lookup used by Android tap-through captures.
 * Run: node --test scripts/native-capture/android-ui-find.test.mjs
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { findNodeBounds } from './android-ui-find.mjs';

const XML = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0">
<node index="0" text="" content-desc="Watch again" bounds="[42,2100][530,2240]">
  <node index="0" text="Watch again" content-desc="" bounds="[120,2150][460,2190]" />
</node>
<node index="1" text="Ranking" content-desc="" bounds="[560,2100][1040,2240]" />
<node index="2" text="" content-desc="Fight progress" bounds="[200,2250][880,2394]" />
</hierarchy>`;

test('content-desc wins over nested text (Pressable hit box)', () => {
  const hit = findNodeBounds(XML, 'watch again');
  assert.deepEqual(hit, { x1: 42, y1: 2100, x2: 530, y2: 2240, cx: 286, cy: 2170 });
});

test('falls back to visible text', () => {
  assert.equal(findNodeBounds(XML, 'Ranking')?.cx, 800);
});

test('bounds for scrub track', () => {
  const hit = findNodeBounds(XML, 'Fight progress');
  assert.equal(hit?.x1, 200);
  assert.equal(hit?.x2, 880);
});

test('missing label returns null', () => {
  assert.equal(findNodeBounds(XML, 'Back to Ludus'), null);
});
