import { describe, it, expect } from 'vitest';

describe('orchestrator mapping', () => {
  it('maps mount.view to tab', async () => {
    const { WealthOrchestrator, viewForMount } =
      await import('../src/ui/wealthflow-orchestrator.js');
    expect(viewForMount({ view: 'stocks' })).toBe('stocks');
    expect(viewForMount({ view: 'banks' })).toBe('banks');
    expect(viewForMount({})).toBe('overview');
    expect(viewForMount({ view: 'nope' })).toBe('overview');
    expect(typeof WealthOrchestrator).toBe('function');
  });
});
