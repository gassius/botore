#!/usr/bin/env node
/**
 * Two-session proof that atlas publication serializes against manifest mutations.
 *
 * A holds atlas_versions FOR UPDATE via a draft entry insert.
 * B's publish must block until A commits.
 * After publish, further mutations are rejected (55000 / atlas_manifest_immutable).
 *
 * Requires DATABASE_URL and `pg` (apps/api dependency).
 */
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

function fail(msg) {
  console.error(`ATLAS-RACE-FAIL ${msg}`);
  process.exit(1);
}

const require = createRequire(join(ROOT, 'apps/api/package.json'));
const { Client } = require('pg');

async function main() {
  const version = `v${Date.now()}`;
  const draftDest = `v${Date.now() + 7}`;

  const setup = new Client({ connectionString: DATABASE_URL });
  await setup.connect();
  await setup.query(`select set_config('request.jwt.claim.role','service_role',true)`);
  await setup.query(
    `insert into public.atlas_versions (version, status, published_at, manifest, budgets_final, notes)
     values ($1::text, 'draft', null, jsonb_build_object('version', $1::text), false, 'race fixture')`,
    [version],
  );
  await setup.query(
    `insert into public.atlas_versions (version, status, published_at, manifest, budgets_final, notes)
     values ($1::text, 'draft', null, jsonb_build_object('version', $1::text), false, 'race dest')`,
    [draftDest],
  );
  await setup.query(
    `insert into public.atlas_manifest_entries (version, asset_key, kind, part_id, role, path)
     values ($1, 'race.root', 'manifest', null, 'manifest', 'manifest.json')`,
    [version],
  );
  await setup.query(
    `insert into storage.objects (bucket_id, name, metadata)
     values ('atlas', $1, '{"race":true}'::jsonb)`,
    [`${version}/manifest.json`],
  );
  await setup.end();

  const a = new Client({ connectionString: DATABASE_URL });
  const b = new Client({ connectionString: DATABASE_URL });
  await a.connect();
  await b.connect();

  await a.query('begin');
  // Acquires atlas_versions FOR UPDATE through the immutability trigger.
  await a.query(
    `insert into public.atlas_manifest_entries (version, asset_key, kind, part_id, role, path)
     values ($1, 'race.pending', 'image', null, 'fx', 'fx/race.png')`,
    [version],
  );
  await a.query(
    `insert into storage.objects (bucket_id, name, metadata)
     values ('atlas', $1, '{"race":true}'::jsonb)`,
    [`${version}/fx/race.png`],
  );

  let publishResolved = false;
  let publishError = null;
  const publishPromise = (async () => {
    // Keep role + publish in one transaction so set_config(…, true) sticks
    // and so FOR UPDATE contention is observable against A's open txn.
    await b.query('begin');
    await b.query(`select set_config('request.jwt.claim.role','service_role',true)`);
    try {
      await b.query(`select public.publish_atlas_version($1::text)`, [version]);
      await b.query('commit');
    } catch (err) {
      publishError = err;
      try {
        await b.query('rollback');
      } catch {
        /* ignore */
      }
    } finally {
      publishResolved = true;
    }
  })();

  await new Promise((r) => setTimeout(r, 500));
  if (publishResolved) {
    fail(
      `publish returned before session A released the version lock` +
        (publishError ? ` (${publishError.message})` : ''),
    );
  }

  await a.query('commit');
  await publishPromise;

  if (publishError) {
    fail(`publish failed after A committed: ${publishError.message}`);
  }

  // Post-publish insert rejected.
  try {
    await a.query(
      `insert into public.atlas_manifest_entries (version, asset_key, kind, part_id, role, path)
       values ($1, 'race.after', 'image', null, 'fx', 'fx/after.png')`,
      [version],
    );
    fail('post-publish manifest insert was allowed');
  } catch (err) {
    if (err.code !== '55000' || !/atlas_manifest_immutable/.test(err.message)) {
      fail(`expected 55000 atlas_manifest_immutable, got ${err.code} ${err.message}`);
    }
  }

  // Source-side reparent from published → draft dest rejected.
  try {
    await a.query(
      `update public.atlas_manifest_entries
          set version = $2, asset_key = 'race.moved', path = 'fx/moved.png'
        where version = $1 and asset_key = 'race.root'`,
      [version, draftDest],
    );
    fail('reparenting published manifest entry was allowed');
  } catch (err) {
    if (err.code !== '55000' || !/atlas_manifest_immutable/.test(err.message)) {
      fail(`expected 55000 atlas_manifest_immutable on reparent, got ${err.code} ${err.message}`);
    }
  }

  // Storage rename off published prefix rejected.
  try {
    await a.query(
      `update storage.objects
          set name = $2
        where bucket_id = 'atlas' and name = $1`,
      [`${version}/manifest.json`, `${draftDest}/manifest.json`],
    );
    fail('storage rename from published prefix was allowed');
  } catch (err) {
    if (err.code !== '55000' || !/atlas_storage_immutable/.test(err.message)) {
      fail(`expected 55000 atlas_storage_immutable on rename, got ${err.code} ${err.message}`);
    }
  }

  await a.end();
  await b.end();
  console.log(
    `ATLAS-RACE-OK ${version}: publish waited; post-publish insert/reparent/rename rejected`,
  );
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
