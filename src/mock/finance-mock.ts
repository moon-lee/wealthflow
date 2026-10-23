export function createMockFinance(): import('finance').FinanceApi {
  const mem = new Map<string, Map<number, Record<string, unknown>>>();
  let nextId = 1;
  // shared service registry for mock — survives across finance instances in same page (for cross-extension dev)
  const g: any = globalThis as any;
  if (!g.__mockServices)
    g.__mockServices = new Map<
      string,
      Record<string, (p?: unknown) => unknown>
    >();
  const servicesRegistry: Map<
    string,
    Record<string, (p?: unknown) => unknown>
  > = g.__mockServices;
  // Per-instance: a command registry belongs to the finance object that owns
  // it, unlike the service registry which is shared across the page.
  const commandRegistry = new Map<string, (...args: unknown[]) => unknown>();
  // Per-instance, like the command registry: a setting belongs to the finance
  // object that wrote it.
  const settings = new Map<string, unknown>();
  const table = (name: string) => {
    if (!mem.has(name)) mem.set(name, new Map());
    const m = mem.get(name)!;
    return {
      find: async (filter = {}) =>
        [...m.values()].filter((r) =>
          Object.entries(filter).every(([k, v]) => r[k] === v),
        ),
      findOne: async (filter = {}) =>
        [...m.values()].find((r) =>
          Object.entries(filter).every(([k, v]) => r[k] === v),
        ) ?? null,
      insert: async (row: any) => {
        const id = nextId++;
        const r = { id, ...row };
        m.set(id, r);
        return r;
      },
      update: async (filter: any, patch: any) => {
        let n = 0;
        for (const [id, r] of m)
          if (Object.entries(filter).every(([k, v]) => r[k] === v)) {
            m.set(id, { ...r, ...patch });
            n++;
          }
        return { affected: n };
      },
      delete: async (filter: any) => {
        let n = 0;
        for (const [id, r] of m)
          if (Object.entries(filter).every(([k, v]) => r[k] === v)) {
            m.delete(id);
            n++;
          }
        return { affected: n };
      },
      count: async (filter = {}) =>
        [...m.values()].filter((r) =>
          Object.entries(filter).every(([k, v]) => r[k] === v),
        ).length,
    };
  };
  return {
    commands: {
      // A REAL command registry, mirroring the host. It used to be a stub, so a
      // command registered in the dev harness did nothing and a panel-side
      // call through the command bridge silently failed. The dev harness now
      // wires financeShell.extensions.executeCommand to this, so a button that
      // reaches the host for work works in dev the same way it does in the app.
      registerCommand: (
        id: string,
        _title: string,
        handler: (...args: unknown[]) => unknown,
      ) => {
        commandRegistry.set(id, handler);
      },
      execute: async (id: string, ...args: unknown[]) => {
        const handler = commandRegistry.get(id);
        if (!handler) return null;
        return await handler(...args);
      },
    },
    ai: { registerTool: () => {} },
    db: { table } as never,
    services: {
      register: (
        name: string,
        impl: Record<string, (p?: unknown) => unknown>,
      ) => {
        servicesRegistry.set(name, impl);
      },
      unregister: (name: string) => {
        servicesRegistry.delete(name);
      },
      invoke: async (name: string, method: string, params?: unknown) => {
        const svc = servicesRegistry.get(name);
        if (!svc || typeof svc[method] !== 'function') return null;
        // Mirror the host exactly (host.js invoke): the method is extracted
        // then called, so `this` is undefined. Services must be `this`-free.
        // See D:\finance_flow_ai\src\main\services\
        // domain-service-registry.ts:38 and extension-host\api\services.ts:36.
        const args =
          params === undefined || params === null
            ? []
            : Array.isArray(params)
              ? params
              : Object.values(params as object);
        const fn = svc[method] as (...a: unknown[]) => unknown;
        return await fn(...args);
      },
    },
    ui: {
      requestMount: async () => {},
      setDirty: () => {},
      autoSaveDraft: async () => {},
      onBeforeUnmount: () => {},
    },
    events: { on: () => () => {}, emit: async () => {} },
    // A real store, not a stub: the AMIT basis is a persisted preference, and
    // a dev harness whose settings vanish between reads cannot exercise it.
    settings: {
      get: async (key: string) => settings.get(key) ?? null,
      set: async (key: string, value: unknown) => {
        settings.set(key, value);
      },
    },
  } as never;
}
