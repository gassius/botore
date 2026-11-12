#!/usr/bin/env node
/**
 * CI assertion: Edge Functions keep a multi-file Deno layout.
 *
 * Guardrail against Dashboard "bundle with esbuild" / single-file deploys
 * drifting from the repo tree (index.ts + relative imports + _shared).
 *
 * Usage: node scripts/check-edge-multifile-layout.mjs
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const functionsRoot = join(root, 'supabase/functions');

const REQUIRED = ['health', 'combat-v1', 'platform-auth', 'account-delete'];

function fail(msg) {
  console.error(`EDGE-MULTIFILE FAIL: ${msg}`);
  process.exit(1);
}

function listTsFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue;
    const abs = join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) out.push(...listTsFiles(abs));
    else if (name.endsWith('.ts')) out.push(abs);
  }
  return out;
}

if (!existsSync(functionsRoot)) fail(`missing ${functionsRoot}`);

const shared = join(functionsRoot, '_shared');
if (!existsSync(shared) || !statSync(shared).isDirectory()) {
  fail('supabase/functions/_shared must exist for multi-file shared modules');
}

for (const name of REQUIRED) {
  const dir = join(functionsRoot, name);
  const index = join(dir, 'index.ts');
  if (!existsSync(index)) fail(`missing entrypoint ${name}/index.ts`);

  const sources = listTsFiles(dir).filter((p) => !p.endsWith('_test.ts'));
  if (sources.length < 2) {
    fail(
      `${name}: expected multi-file layout (index.ts + ≥1 sibling .ts); found ${sources.length}`,
    );
  }

  const indexSrc = readFileSync(index, 'utf8');
  const hasRelativeImport =
    /from\s+['"]\.\/[^'"]+['"]/.test(indexSrc) || /from\s+['"]\.\.\/[^'"]+['"]/.test(indexSrc);
  if (!hasRelativeImport) {
    fail(
      `${name}/index.ts must import relative modules (./ or ../) — do not ship a collapsed single-file esbuild bundle as the source of truth`,
    );
  }

  // Reject obvious one-shot bundle artifacts checked into the function dir.
  for (const artifact of ['bundle.js', 'index.bundle.js', 'esbuild-out.js']) {
    if (existsSync(join(dir, artifact))) {
      fail(`${name}: refuse checked-in bundle artifact ${artifact}`);
    }
  }
}

console.log(
  JSON.stringify(
    {
      gate: 'edge-multifile-layout',
      ok: true,
      functions: REQUIRED,
      note: 'Deploy with `supabase functions deploy` (see .github/workflows/deploy-edge-functions.yml); never Dashboard esbuild-only.',
    },
    null,
    2,
  ),
);
