export function normalizeWhitespace(text) {
  return String(text ?? '')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

export function stripHtmlTags(html) {
  if (!html) return '';
  return String(html)
    .replaceAll(/<[^>]+>/g, '')
    .trim();
}

// Congress.gov action text sometimes differs only by whitespace/newlines/HTML.
export function normalizeActionText(text) {
  const stripped = stripHtmlTags(text);
  // Congress.gov sometimes includes HTML entities in action text.
  const deEnt = stripped.replaceAll(/&nbsp;|&#160;/gi, ' ');
  return normalizeWhitespace(deEnt);
}

// Convert a Date/ISO-like string to YYYY-MM-DD when possible.
export function toDateOnlyString(value) {
  if (value == null) return '';

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    return value.toISOString().slice(0, 10);
  }

  const raw = String(value).trim();
  if (!raw) return '';

  const direct = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
  if (direct) return direct[1];

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return raw;
}

// Dedupe content-layer actions (already coerced into objects with Date + text).
export function dedupeActionEntries(actions) {
  const seen = new Set();
  const out = [];

  for (const action of actions || []) {
    const dateKey = toDateOnlyString(action?.date);
    const textKey = normalizeActionText(action?.text);
    const key = `${dateKey}|${textKey}`;

    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...action, text: textKey });
  }

  return out;
}

// Dedupe Congress.gov API actions (actionDate/text shape) and normalize date/text.
export function dedupeCongressApiActions(actions) {
  const seen = new Set();
  const out = [];

  for (const action of actions || []) {
    const dateKey = toDateOnlyString(action?.actionDate);
    const textKey = normalizeActionText(action?.text);
    const key = `${dateKey}|${textKey}`;

    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...action, actionDate: dateKey, text: textKey });
  }

  return out;
}
