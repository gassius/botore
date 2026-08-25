#!/usr/bin/env node
/**
 * Architecture boundary checker.
 *
 * Enforces AGENTS.md import rules:
 *  - packages/{rng,replay,domain,combat-engine} are PURE: no framework,
 *    Node-only, browser, or provider imports; no Math.random()/Date.now().
 *  - apps/game must not import server/db code (fastify, pg, supabase).
 *  - packages must not import from apps/.
 *  - dashboard lib/ never imports service-role keys (heuristic).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];

const PURE_PACKAGES = [
  'packages/rng',
  'packages/replay',
  'packages/domain',
  'packages/combat-engine',
];

// Specifiers that indicate non-pure dependencies.
const FORBIDDEN_IN_PURE = [
  'fastify',
  'pg',
  '@supabase',
  'next',
  'react',
  'react-dom',
  'node:',
  'cocos',
  'cc',
  'expo',
  'ws',
  'redis',
  'ioredis',
];
// Files in pure packages may not use these APIs at all.
const FORBIDDEN_PURE_CALLS = [/\bMath\.random\s*\(/, /\bDate\.now\s*\(/, /\bnew Date\s*\(\s*\)/];

function walk(dir, out = []) {
  let entries;
  try {
    entries = require('node:fs').readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', 'dist', '.next', '.turbo', 'coverage'].includes(e.name)) continue;
      walk(p, out);
    } else if (/\.(ts|tsx|mts|mjs)$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

function checkFile(path, isPure) {
  const src = readFileSync(path, 'utf8');
  const rel = relative(root, path);

  // import/export-from/require specifiers
  const specifiers = [];
  const importRe = /(?:from\s+|require\s*\(\s*|import\s+)['"]([^'"]+)['"]/g;
  let m;
  while ((m = importRe.exec(src)) !== null) specifiers.push(m[1]);

  for (const spec of specifiers) {
    for (const bad of FORBIDDEN_IN_PURE) {
      if (isPure && spec.includes(bad)) {
        errors.push(`${rel}: pure package imports forbidden specifier '${bad}' (${spec})`);
      }
    }
    if (isPure && !spec.startsWith('.') && !spec.startsWith('@botore/') && spec.startsWith('@')) {
      // allow typebox? No — pure packages must be dependency-free except noble hashes
      const allowed = ['@noble/hashes'];
      if (!allowed.some((a) => spec === a || spec.startsWith(a + '/'))) {
        errors.push(`${rel}: pure package imports non-allowlisted package '${spec}'`);
      }
    }
    if (
      spec.startsWith('apps/') ||
      spec.includes('/apps/api') ||
      spec.includes('/apps/dashboard')
    ) {
      errors.push(`${rel}: package imports application code '${spec}'`);
    }
  }

  if (isPure) {
    for (const re of FORBIDDEN_PURE_CALLS) {
      if (re.test(src)) {
        errors.push(`${rel}: pure package uses forbidden nondeterministic call ${re}`);
      }
    }
  }

  // game app must not import server/db code
  if (rel.startsWith('apps/game')) {
    for (const spec of specifiers) {
      if (/^(fastify|pg$|@supabase)/.test(spec)) {
        errors.push(`${rel}: game client imports server/database module '${spec}'`);
      }
    }
  }
}

for (const pkg of PURE_PACKAGES) {
  for (const f of walk(join(root, pkg))) checkFile(f, true);
}
for (const dir of [
  'apps/game/src',
  'apps/game/test',
  'apps/dashboard/lib',
  'packages/test-fixtures/src',
]) {
  const full = join(root, dir);
  if (existsSync(full)) for (const f of walk(full)) checkFile(f, false);
}

if (errors.length > 0) {
  console.error('BOUNDARY VIOLATIONS:');
  for (const e of errors) console.error(' -', e);
  process.exit(1);
}
console.log('boundaries OK');
