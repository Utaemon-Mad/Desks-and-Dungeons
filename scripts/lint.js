// Comprobación rápida: todos los .js del proyecto se pueden analizar sin errores de sintaxis.
// Uso: npm run lint            (todo el proyecto)
//      npm run lint -- a.js b.js (sólo esos ficheros)
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const skip = new Set(['node_modules', '.git', 'data', 'vendor']);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

const files = process.argv.length > 2 ? process.argv.slice(2).map((f) => path.resolve(f)) : walk(root);
let failed = 0;
for (const f of files) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (err) {
    failed++;
    console.error(`✘ ${path.relative(root, f)}\n${err.stderr.toString()}`);
  }
}
console.log(failed ? `${failed} de ${files.length} ficheros con errores` : `✔ ${files.length} ficheros sin errores de sintaxis`);
process.exit(failed ? 1 : 0);
