/**
 * Vitest global setup for VoteChain POC tests.
 *
 * Node 20+ provides crypto.subtle, crypto.getRandomValues, TextEncoder,
 * TextDecoder, atob, and btoa as globals. Only localStorage is missing
 * and needs a simple in-memory shim.
 */

const store = new Map<string, string>();

const localStorageMock: Storage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    store.set(key, value);
  },
  removeItem: (key: string) => {
    store.delete(key);
  },
  clear: () => store.clear(),
  get length() {
    return store.size;
  },
  key: (index: number) => {
    const keys = [...store.keys()];
    return keys[index] ?? null;
  },
};

// Install the mock on globalThis so the POC modules can use it.
Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
});

// Reset localStorage between tests to avoid state leaking.
import { beforeEach } from 'vitest';

beforeEach(() => {
  store.clear();
});
