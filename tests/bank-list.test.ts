import { describe, it, expect } from 'vitest';

describe('bank-list element', () => {
  it('registers custom element', async () => {
    await import('../src/ui/bank-list.js');
    expect(customElements.get('bank-list')).toBeDefined();
  });
});
