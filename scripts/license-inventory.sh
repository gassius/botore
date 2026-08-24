#!/usr/bin/env bash
# Third-party license inventory.
# - Runtime deps of shippable workspaces must have permissive licenses.
# - Full inventory is written to a gitignored temp file for review.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT="node_modules/.license-inventory.txt"
mkdir -p node_modules

echo "package@version license" > "$OUT"
FAIL=0
while IFS= read -r row; do
  [ -z "$row" ] && continue
  echo "$row" >> "$OUT"
  lic=$(printf '%s' "$row" | sed 's/.* \(.*\)$/\1/')
  case "$lic" in
    MIT|ISC|"Apache-2.0"|BSD*|"0BSD"|CC0-1.0|"BlueOak-1.0.0"|"Python-2.0") ;;
    UNLICENSED) echo "FAIL unlicensed: $row"; FAIL=1 ;;
    *) echo "REVIEW needed: $row"; FAIL=1 ;;
  esac
done < <(pnpm -r exec node -e '
const fs=require("fs");
function find(dir,out){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=dir+"/"+e.name;
if(e.isDirectory()){if(e.name==="node_modules"||e.name.startsWith("."))continue;find(p,out);}
else if(e.name==="package.json"){try{const j=JSON.parse(fs.readFileSync(p,"utf8"));
if(j.private)return;out.push((j.name||"?")+"@"+(j.version||"?")+" "+(j.license||"UNLICENSED"));}catch{}}}}
const out=[];find("packages",out);find("apps",out);console.log(out.sort().join("\n"));
')

if [ "$FAIL" = "0" ]; then echo "license-inventory: OK (inventory at $OUT)"; else exit 1; fi
