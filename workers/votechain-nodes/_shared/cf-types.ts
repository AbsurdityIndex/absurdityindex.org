/* eslint-disable no-undef */
// Minimal Cloudflare Workers / Durable Objects type shims for this repo.
// (This project does not include @cloudflare/workers-types in tsconfig.)

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

export type DurableObjectId = { readonly __opaque: 'DurableObjectId' };

export interface DurableObjectStub {
  fetch(input: RequestInfo, init?: RequestInit): Promise<Response>;
}

export interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}

export interface DurableObjectListOptions {
  prefix?: string;
  start?: string;
  limit?: number;
}

export interface DurableObjectStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T = unknown>(key: string, value: T): Promise<void>;
  list<T = unknown>(options?: DurableObjectListOptions): Promise<Map<string, T>>;
}

export interface DurableObjectState {
  storage: DurableObjectStorage;
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
}
