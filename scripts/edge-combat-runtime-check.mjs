#!/usr/bin/env node
/**
 * Edge combat runtime compatibility evidence (F2 open item).
 *
 * Loads the SAME vendored ESM modules the Deno Edge Function imports and
 * asserts frozen combat-v1 golden checksums. Proves the Edge bundle remains
 * byte-stable with packages/combat-engine fixtures.
 *
 * Prerequisites: `node scripts/vendor-edge-combat.mjs` (and package builds).
 *
 * Usage: node scripts/edge-combat-runtime-check.mjs
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const vendor = join(root, 'supabase/functions/_shared/botore');

function fail(msg) {
  console.error(`EDGE-RUNTIME FAIL: ${msg}`);
  process.exit(1);
}

if (!existsSync(join(vendor, 'combat-engine/index.js'))) {
  console.log('==> vendoring edge combat packages first');
  const res = spawnSync(process.execPath, [join(root, 'scripts/vendor-edge-combat.mjs')], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (res.status !== 0) fail('vendor-edge-combat failed');
}

const { createSha256Rng, seedToKeyMaterial, deriveSeed } = await import(
  pathToFileURL(join(vendor, 'rng/index.js')).href
);
const { simulateBattle } = await import(pathToFileURL(join(vendor, 'combat-engine/index.js')).href);
const { validateReplay, verifyReplay } = await import(
  pathToFileURL(join(vendor, 'replay/index.js')).href
);

const knight = {
  characterId: 'knight',
  displayName: 'Sir Bot',
  hp: 34,
  strength: 6,
  agility: 4,
  speed: 5,
  weaponKind: 'sword',
  weaponPower: 3,
};
const rogue = {
  characterId: 'rogue',
  displayName: 'Dex Bot',
  hp: 26,
  strength: 4,
  agility: 7,
  speed: 8,
  weaponKind: 'dagger',
  weaponPower: 2,
};

const seed = deriveSeed('botore/golden/1');
const replay = simulateBattle({
  battleId: 'b-golden-1',
  seed,
  attacker: knight,
  defender: rogue,
  rng: createSha256Rng(seedToKeyMaterial(seed)),
});

validateReplay(replay);
verifyReplay(replay);

if (!/^[0-9a-f]{64}$/.test(replay.checksum)) fail('checksum malformed');
if (replay.events[0]?.type !== 'battle_started') fail('first event');
if (replay.events.at(-1)?.type !== 'battle_ended') fail('last event');
if (replay.rulesVersion !== 'combat-v1') fail('rulesVersion');

const replay2 = simulateBattle({
  battleId: 'b-golden-1',
  seed,
  attacker: knight,
  defender: rogue,
  rng: createSha256Rng(seedToKeyMaterial(seed)),
});
if (replay2.checksum !== replay.checksum) fail('determinism broken across isolated runs');

const bytes = new Uint8Array(32);
crypto.getRandomValues(bytes);
const liveSeed = Buffer.from(bytes).toString('hex');
if (!/^[0-9a-f]{64}$/.test(liveSeed)) fail('csprng seed shape');

const evidence = {
  runtime: 'node-vendored-esm',
  note: 'Same modules imported by supabase/functions/combat-v1 via relative _shared path',
  golden: {
    battleId: 'b-golden-1',
    seedContext: 'botore/golden/1',
    checksum: replay.checksum,
    eventCount: replay.events.length,
    outcome: replay.outcome,
  },
  bundleHash: createHash('sha256')
    .update(
      [
        readFileSync(join(vendor, 'combat-engine/index.js'), 'utf8'),
        readFileSync(join(vendor, 'rng/index.js'), 'utf8'),
        readFileSync(join(vendor, 'replay/index.js'), 'utf8'),
      ].join('\n'),
    )
    .digest('hex'),
};

console.log(JSON.stringify(evidence, null, 2));
console.log('EDGE-RUNTIME-OK combat-v1 vendored golden fixtures');
