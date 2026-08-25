// Collects name@version license rows for workspace packages (non-private).
const fs = require('fs');

function find(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = dir + '/' + e.name;
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      find(p, out);
    } else if (e.name === 'package.json') {
      try {
        const j = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (j.private) return out;
        out.push((j.name || '?') + '@' + (j.version || '?') + ' ' + (j.license || 'UNLICENSED'));
      } catch {
        /* skip malformed */
      }
    }
  }
  return out;
}

const root = process.cwd();
const out = [];
for (const base of ['packages', 'apps']) {
  const dir = root + '/' + base;
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        const pkg = dir + '/' + e.name + '/package.json';
        if (fs.existsSync(pkg)) {
          try {
            const j = JSON.parse(fs.readFileSync(pkg, 'utf8'));
            if (!j.private) {
              out.push(
                (j.name || '?') + '@' + (j.version || '?') + ' ' + (j.license || 'UNLICENSED'),
              );
            }
          } catch {}
        }
      }
    }
  } catch {}
}
console.log(out.sort().join('\n'));
