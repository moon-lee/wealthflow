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
    commands: { registerCommand: () => {}, execute: async () => {} },
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
        // Mirror the host: params are spread as positional args, so callers
        // must pass an array. See D:\finance_flow_ai\src\main\services\
        // domain-service-registry.ts:38 and extension-host\api\services.ts:36.
        const args =
          params === undefined || params === null
            ? []
            : Array.isArray(params)
              ? params
              : Object.values(params as object);
        return await (svc[method] as (...a: unknown[]) => unknown)(...args);
      },
    },
    ui: {
      requestMount: async () => {},
      setDirty: () => {},
      autoSaveDraft: async () => {},
      onBeforeUnmount: () => {},
    },
    events: { on: () => () => {}, emit: async () => {} },
    settings: { get: async () => null, set: async () => {} },
  } as never;
}
