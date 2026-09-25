import { describe, it, expect } from 'vitest';

describe('stock ui tags', () => {
  it('registers all three', async () => {
    await import('../src/ui/stock-list.js');
    await import('../src/ui/dividend-log.js');
    await import('../src/ui/dividend-form.js');
    expect(customElements.get('stock-list')).toBeDefined();
    expect(customElements.get('dividend-log')).toBeDefined();
    expect(customElements.get('dividend-form')).toBeDefined();
  });
});
