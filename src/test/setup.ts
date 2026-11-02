import 'fake-indexeddb/auto';

const area = new Map<string, unknown>();

Object.assign(globalThis, {
  chrome: {
    storage: {
      local: {
        async get(key: string) {
          return area.has(key) ? { [key]: area.get(key) } : {};
        },
        async set(items: Record<string, unknown>) {
          for (const [k, v] of Object.entries(items)) area.set(k, v);
        },
        async remove(key: string) {
          area.delete(key);
        },
      },
    },
  },
});
