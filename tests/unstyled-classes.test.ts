import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * A class name in the markup with no CSS rule renders as the browser's
 * default — which is how the trade log's Date header ended up looking like a
 * grey button next to every other log. This runs the checker so the next
 * invented class name fails a test instead of shipping.
 */
describe('unstyled class names', () => {
  it('finds none', () => {
    const out = execFileSync(
      process.execPath,
      [resolve(process.cwd(), 'scripts', 'check-unstyled-classes.mjs')],
      { encoding: 'utf8' },
    );
    expect(out.trim()).toBe('no unstyled class names');
  });
});
