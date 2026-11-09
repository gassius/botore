#!/usr/bin/env node
/**
 * F5/F6 atlas bootstrap: upload real Storage payloads for a draft pack, verify
 * downloads, then publish. Migrations only register draft + manifest rows —
 * they must NOT fabricate storage.objects metadata.
 *
 * Contract for loaders (F6):
 *   1. Pack starts as atlas_versions.status = 'draft'
 *   2. This script uploads every atlas_manifest_entries.path under atlas/vN/
 *      via the Supabase Storage API (payloads, not SQL inserts)
 *   3. publish_atlas_version(vN) locks the version, requires every path present,
 *      then freezes the pack as immutable
 *   4. get_atlas_manifest(vN) / authenticated save_bot_loadout only accept published
 *
 * Usage (after supabase start + db reset migrations):
 *   node scripts/seed-atlas-storage.mjs
 *   ATLAS_VERSION=v1 node scripts/seed-atlas-storage.mjs
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = process.env.ATLAS_VERSION ?? 'v1';
const SEED_DIR = join(ROOT, 'supabase/seed/atlas', VERSION);
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';

function fail(msg) {
  console.error(`ATLAS-SEED-FAIL ${msg}`);
  process.exit(1);
}

function loadServiceKey() {
  let key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SERVICE_ROLE_KEY ?? '';
  if (key) return key;
  const status = spawnSync('pnpm', ['exec', 'supabase', 'status', '-o', 'env'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (status.status !== 0) {
    fail(`could not load service role key (${status.stderr || status.stdout})`);
  }
  for (const line of status.stdout.split('\n')) {
    const m = line.match(/^(?:export )?SERVICE_ROLE_KEY=(.*)$/);
    if (m) {
      key = m[1].replace(/^['"]|['"]$/g, '');
      break;
    }
  }
  if (!key) fail('SERVICE_ROLE_KEY missing');
  return key;
}

function psqlJson(sql) {
  const r = spawnSync('psql', [DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql], {
    encoding: 'utf8',
  });
  if (r.status !== 0) fail(`psql failed: ${r.stderr || r.stdout}`);
  return r.stdout.trim();
}

function contentType(path) {
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.m4a')) return 'audio/mp4';
  if (path.endsWith('.json')) return 'application/json';
  return 'application/octet-stream';
}

async function uploadAndVerify(serviceKey, relativePath) {
  const localPath = join(SEED_DIR, relativePath);
  if (!existsSync(localPath)) fail(`missing local seed file ${localPath}`);
  const bytes = readFileSync(localPath);
  if (bytes.byteLength < 1) fail(`empty seed file ${relativePath}`);

  const objectPath = `${VERSION}/${relativePath}`;
  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/atlas/${objectPath}`;
  const put = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'Content-Type': contentType(relativePath),
      'x-upsert': 'true',
    },
    body: bytes,
  });
  if (!put.ok) {
    const body = await put.text();
    fail(`upload ${objectPath} HTTP ${put.status}: ${body}`);
  }

  const get = await fetch(`${SUPABASE_URL}/storage/v1/object/authenticated/atlas/${objectPath}`, {
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
    },
  });
  if (!get.ok) {
    // Fallback to public/authenticated path variants used by local gateway.
    const get2 = await fetch(`${SUPABASE_URL}/storage/v1/object/atlas/${objectPath}`, {
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
    });
    if (!get2.ok) {
      fail(`download verify ${objectPath} HTTP ${get.status}/${get2.status}`);
    }
    const got = Buffer.from(await get2.arrayBuffer());
    if (got.byteLength !== bytes.byteLength) {
      fail(`download size mismatch ${objectPath}: ${got.byteLength} != ${bytes.byteLength}`);
    }
    return;
  }
  const got = Buffer.from(await get.arrayBuffer());
  if (got.byteLength !== bytes.byteLength) {
    fail(`download size mismatch ${objectPath}: ${got.byteLength} != ${bytes.byteLength}`);
  }
}

async function main() {
  if (!existsSync(SEED_DIR)) fail(`seed dir missing: ${SEED_DIR}`);

  const status = psqlJson(
    `select coalesce(status, '') from public.atlas_versions where version = '${VERSION}'`,
  );
  if (!status) fail(`atlas version ${VERSION} not registered`);
  if (status === 'published') {
    console.log(`ATLAS-SEED-OK ${VERSION} already published`);
    return;
  }
  if (status !== 'draft') fail(`atlas version ${VERSION} status=${status}, expected draft`);

  const pathsJson = psqlJson(
    `select coalesce(json_agg(path order by path), '[]'::json)
       from public.atlas_manifest_entries where version = '${VERSION}'`,
  );
  const paths = JSON.parse(pathsJson);
  if (!Array.isArray(paths) || paths.length < 1) {
    fail(`no manifest entries for ${VERSION}`);
  }

  // Refuse publish without Storage payloads: prove missing-objects gate first.
  const missingBefore = psqlJson(
    `select coalesce(array_length(public.atlas_missing_storage_paths('${VERSION}'), 1), 0)::text`,
  );
  if (Number(missingBefore) < 1 && status === 'draft') {
    // Objects may already exist from a prior partial run — still re-upload/verify.
    console.log(`ATLAS-SEED note: ${VERSION} already has storage objects; re-verifying`);
  } else {
    // Attempt publish before upload must fail.
    const publishEarly = spawnSync(
      'psql',
      [
        DATABASE_URL,
        '-v',
        'ON_ERROR_STOP=1',
        '-At',
        '-c',
        `select set_config('request.jwt.claim.role','service_role',false); select public.publish_atlas_version('${VERSION}')::text;`,
      ],
      { encoding: 'utf8' },
    );
    if (publishEarly.status === 0) {
      fail('publish succeeded before Storage uploads — missing-object gate broken');
    }
    if (!/atlas_publish_missing_objects/.test(publishEarly.stderr + publishEarly.stdout)) {
      fail(
        `expected atlas_publish_missing_objects before upload, got: ${publishEarly.stderr || publishEarly.stdout}`,
      );
    }
    console.log('ATLAS-SEED-OK publish correctly rejected without Storage payloads');
  }

  const serviceKey = loadServiceKey();
  console.log(`ATLAS-SEED uploading ${paths.length} objects for ${VERSION}…`);
  for (const rel of paths) {
    await uploadAndVerify(serviceKey, rel);
  }

  // Probe required kinds for smoke: manifest + image + audio
  for (const probe of ['manifest.json', 'fx/hit.png', 'base/audio/hit.m4a']) {
    if (!paths.includes(probe)) fail(`proof pack missing required probe path ${probe}`);
  }
  // AAC probe on silent m4a (no final art — decode container only)
  const probe = spawnSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'a:0',
      '-show_entries',
      'stream=codec_name',
      '-of',
      'csv=p=0',
      join(SEED_DIR, 'base/audio/hit.m4a'),
    ],
    { encoding: 'utf8' },
  );
  if (probe.status === 0) {
    const codec = probe.stdout.trim();
    if (!codec.includes('aac')) fail(`expected aac codec in hit.m4a, got ${codec || '(empty)'}`);
    console.log('ATLAS-SEED-OK audio placeholder decodes as AAC');
  } else {
    const head = readFileSync(join(SEED_DIR, 'base/audio/hit.m4a'));
    if (head.includes('BOTORE_PLACEHOLDER_AUDIO')) {
      fail('audio placeholder is still the text stub; regenerate silent m4a');
    }
    console.log('ATLAS-SEED-OK audio placeholder is binary (ffprobe unavailable)');
  }

  const published = psqlJson(
    `select set_config('request.jwt.claim.role','service_role',false); select public.publish_atlas_version('${VERSION}')::text;`,
  );
  const result = JSON.parse(published.split('\n').filter(Boolean).at(-1));
  if (!result.ok) fail(`publish failed: ${published}`);
  console.log(
    `ATLAS-SEED-OK published ${VERSION} entries=${result.entryCount} objects=${result.objectCount ?? '?'}`,
  );
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
