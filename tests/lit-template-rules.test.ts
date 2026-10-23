import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A multi-line attribute binding silently corrupts lit's binding alignment.
 *
 * The symptom is not an error at the binding — it is that a LATER element's
 * event handler receives the wrong value, so the button does nothing when
 * clicked. The Investment table's Price header was dead for exactly this
 * reason, and it took a while to find because the template rendered fine.
 *
 * So: no attribute binding may span lines. The expression goes on one line, or
 * it is computed in a variable first.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

/**
 * The bodies of every `html` template in a file.
 *
 * A template literal ends at the first backtick that is not inside a `${}`
 * expression, so the scan has to skip expressions - and the nested templates
 * inside them - rather than looking for the next backtick.
 */
function htmlTemplates(text: string): string[] {
  const out: string[] = [];
  const re = /html`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const start = m.index + m[0].length;
    let i = start;
    while (i < text.length) {
      const c = text[i];
      if (c === '\\') {
        i += 2;
        continue;
      }
      if (c === '$' && text[i + 1] === '{') {
        // Skip the whole expression, including any nested template.
        let braces = 0;
        i++;
        while (i < text.length) {
          const d = text[i];
          if (d === '{') braces++;
          else if (d === '}') {
            braces--;
            if (braces === 0) {
              i++;
              break;
            }
          } else if (d === '`') {
            i++;
            while (i < text.length && text[i] !== '`') {
              if (text[i] === '\\') i++;
              i++;
            }
          } else if (d === "'" || d === '"') {
            const q = d;
            i++;
            while (i < text.length && text[i] !== q) {
              if (text[i] === '\\') i++;
              i++;
            }
          }
          i++;
        }
        continue;
      }
      if (c === '`') break;
      i++;
    }
    out.push(text.slice(start, i));
    // Do NOT jump past the body: a nested `html` template inside an
    // expression is a template of its own, and it can carry the same
    // root-level binding. Skipping ahead hid the Trades section's body, which
    // is how the form and the log stayed out of every test's DOM.
    re.lastIndex = start;
  }
  return out;
}

/**
 * Every binding in a template body, and whether it sits at the ROOT level -
 * a direct child of the template rather than inside an element.
 */
function bindings(body: string): { root: boolean; at: number }[] {
  const out: { root: boolean; at: number }[] = [];
  let depth = 0;
  let i = 0;
  while (i < body.length) {
    const c = body[i];
    if (c === '<') {
      if (body.startsWith('<!--', i)) {
        const end = body.indexOf('-->', i);
        i = end < 0 ? body.length : end + 3;
        continue;
      }
      const close = body.indexOf('>', i);
      if (close < 0) break;
      const tag = body.slice(i, close + 1);
      if (tag.startsWith('</')) depth = Math.max(0, depth - 1);
      else if (/^<[a-zA-Z]/.test(tag) && !tag.endsWith('/>')) depth++;
      i = close + 1;
      continue;
    }
    if (c === '$' && body[i + 1] === '{') {
      out.push({ root: depth === 0, at: i });
      // Skip the expression: braces, strings and nested templates.
      let braces = 0;
      i++;
      while (i < body.length) {
        const d = body[i];
        if (d === '{') braces++;
        else if (d === '}') {
          braces--;
          if (braces === 0) {
            i++;
            break;
          }
        } else if (d === '`') {
          i++;
          while (i < body.length && body[i] !== '`') {
            if (body[i] === '\\') i++;
            i++;
          }
        } else if (d === "'" || d === '"') {
          const q = d;
          i++;
          while (i < body.length && body[i] !== q) {
            if (body[i] === '\\') i++;
            i++;
          }
        }
        i++;
      }
      continue;
    }
    i++;
  }
  return out;
}

describe('lit templates', () => {
  it('has no attribute binding that spans lines', () => {
    const offenders: string[] = [];
    for (const file of walk('src')) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          // `attr=${` with the expression starting on the next line.
          if (/=\$\{\s*$/.test(line))
            offenders.push(`${file}:${i + 1}  ${line.trim()}`);
        });
    }
    expect(offenders).toEqual([]);
  });

  it('has no backtick inside a css template literal', () => {
    // A backtick in a CSS comment ends the template literal and the whole
    // stylesheet fails to import. It has bitten twice, so it is checked.
    const offenders: string[] = [];
    for (const file of walk('src/styles')) {
      const text = readFileSync(file, 'utf8');
      // Find each `css` template and look for a backtick that is not its
      // own closing one.
      const re = /css`/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        const bodyStart = m.index + m[0].length;
        const bodyEnd = text.indexOf('`', bodyStart);
        if (bodyEnd < 0) continue;
        const body = text.slice(bodyStart, bodyEnd);
        if (body.includes('`')) {
          const line = text.slice(0, bodyStart).split('\n').length;
          offenders.push(`${file}:${line}  a backtick inside a css template`);
        }
        re.lastIndex = bodyEnd;
      }
    }
    expect(offenders).toEqual([]);
  });

  it('has no ROOT-level binding', () => {
    // A binding that is a direct child of the template - not inside an
    // element - is invisible to this test environment: happy-dom's parser
    // drops lit's `<?lit$...?>` marker at the root of a template's content,
    // where a browser turns it into a comment. The binding never renders,
    // and the part indexes after it shift, so a LATER binding receives the
    // wrong value.
    //
    // So the content of a root-level binding is never asserted by any test:
    // it is not in the DOM to assert against. Every binding goes inside an
    // element, and then it renders everywhere.
    //
    // Eleven of the fourteen views already do this. The three that did not
    // were the dividend log's table, the CGT section's disposals table and
    // the interest grid's table - all invisible to the whole suite.
    const offenders: string[] = [];
    for (const file of walk('src/ui')) {
      const text = readFileSync(file, 'utf8');
      for (const body of htmlTemplates(text)) {
        const root = bindings(body).find((b) => b.root);
        if (!root) continue;
        const line = text.slice(0, text.indexOf(body)).split('\n').length;
        offenders.push(
          `${file}:${line}  a binding at the root level of the template`,
        );
      }
    }
    expect(offenders).toEqual([]);
  });
});
