// Dev hygiene check: class names used in the UI that no stylesheet defines.
//
// Plain .mjs on purpose - the repo's scripts carry no build step.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

function walk(dir, out = [], exts = ['.ts']) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out, exts);
    else if (exts.includes(extname(p))) out.push(p);
  }
  return out;
}

const styleText = [
  ...walk('src/styles', [], ['.ts', '.css']),
  ...walk('src/vendor', [], ['.ts', '.css']),
]
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');

const cssClasses = new Set();
for (const m of styleText.matchAll(/\.([a-zA-Z][\w-]*)/g)) cssClasses.add(m[1]);

const used = new Map();
for (const f of walk('src/ui')) {
  const text = readFileSync(f, 'utf8');
  const rel = f.replace(/\\/g, '/');
  // A class attribute may interpolate a template expression, so only the
  // literal names around it are collected.
  for (const m of text.matchAll(/class="([^"]*)"/g)) {
    const literal = m[1].replace(/\$\{[^}]*\}/g, ' ').replace(/[?:]/g, ' ');
    for (const cls of literal.split(/\s+/).filter(Boolean)) {
      if (!/^[a-zA-Z][\w-]*$/.test(cls)) continue;
      if (!used.has(cls)) used.set(cls, new Set());
      used.get(cls).add(rel);
    }
  }
}

const missing = [...used.entries()]
  .filter(([cls]) => !cssClasses.has(cls))
  .sort((a, b) => a[0].localeCompare(b[0]));

if (missing.length === 0) {
  console.log('no unstyled class names');
} else {
  for (const [cls, files] of missing)
    console.log(`${cls.padEnd(28)} ${[...files].join(', ')}`);
  console.log(`\n${missing.length} class name(s) with no CSS rule`);
}
