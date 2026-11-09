#!/usr/bin/env node
/**
 * After `expo prebuild`, allow cleartext HTTP to localhost / 127.0.0.1 so iOS
 * Simulator live-fight captures can reach local Supabase (CI / local only).
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '../..');
const iosRoot = join(repoRoot, 'apps/game/ios');
const marker = 'botore-ci-ats-localhost';

function findInfoPlists(dir) {
  const out = [];
  function walk(d) {
    let entries;
    try {
      entries = readdirSync(d);
    } catch {
      return;
    }
    for (const name of entries) {
      if (name === 'Pods' || name === 'DerivedData' || name === 'build') continue;
      const p = join(d, name);
      let st;
      try {
        st = statSync(p);
      } catch {
        continue;
      }
      if (st.isDirectory()) walk(p);
      else if (name === 'Info.plist') out.push(p);
    }
  }
  walk(dir);
  return out;
}

if (!existsSync(iosRoot)) {
  console.error(`error: missing ${iosRoot} — run expo prebuild first`);
  process.exit(1);
}

const atsBlock = `
	<!-- ${marker}: CI / local Simulator only -->
	<key>NSAppTransportSecurity</key>
	<dict>
		<key>NSAllowsLocalNetworking</key>
		<true/>
		<key>NSExceptionDomains</key>
		<dict>
			<key>localhost</key>
			<dict>
				<key>NSExceptionAllowsInsecureHTTPLoads</key>
				<true/>
				<key>NSIncludesSubdomains</key>
				<true/>
			</dict>
			<key>127.0.0.1</key>
			<dict>
				<key>NSExceptionAllowsInsecureHTTPLoads</key>
				<true/>
			</dict>
		</dict>
	</dict>
`;

let patched = 0;
for (const plist of findInfoPlists(iosRoot)) {
  let text = readFileSync(plist, 'utf8');
  if (text.includes(marker)) {
    console.log(`ATS already patched: ${plist}`);
    continue;
  }
  if (text.includes('<key>NSAppTransportSecurity</key>')) {
    text = text.replace(
      /<key>NSAppTransportSecurity<\/key>\s*<dict>[\s\S]*?<\/dict>/,
      atsBlock.trim(),
    );
  } else {
    const idx = text.lastIndexOf('</dict>');
    if (idx < 0) continue;
    text = `${text.slice(0, idx)}${atsBlock}${text.slice(idx)}`;
  }
  writeFileSync(plist, text);
  console.log(`patched ${plist} (ATS localhost cleartext)`);
  patched++;
}

if (patched === 0) {
  console.log('patch-ios-ci-ats: no Info.plist changes needed (or none found)');
}
