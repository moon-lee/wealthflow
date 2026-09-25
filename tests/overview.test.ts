import { describe, it, expect } from 'vitest';

describe('overview-view', () => {
  it('registers element', async () => {
    await import('../src/ui/overview-view.js');
    expect(customElements.get('overview-view')).toBeDefined();
  });
});
