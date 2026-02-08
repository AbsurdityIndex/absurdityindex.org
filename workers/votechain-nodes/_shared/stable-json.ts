function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;

  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) out[key] = sortValue(obj[key]);
  return out;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

