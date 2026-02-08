/* eslint-disable no-undef */
export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has('content-type')) headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(body, null, 2), { ...init, headers });
}

export function jsonError(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): Response {
  return jsonResponse(
    {
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
    },
    { status },
  );
}

export function withCors(resp: Response, origin: string): Response {
  const headers = new Headers(resp.headers);
  headers.set('access-control-allow-origin', origin);
  headers.set('access-control-allow-methods', 'GET,POST,OPTIONS');
  headers.set('access-control-allow-headers', 'content-type,authorization');
  headers.set('access-control-max-age', '86400');
  return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers });
}

export function bearerToken(req: Request): string | null {
  const h = req.headers.get('authorization');
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m?.[1]?.trim() ?? null;
}

export async function readJson<T>(
  req: Request,
  { maxBytes }: { maxBytes: number },
): Promise<{ ok: true; value: T } | { ok: false; error: Response }> {
  let buf: ArrayBuffer;
  try {
    buf = await req.arrayBuffer();
  } catch {
    return { ok: false, error: jsonError(400, 'BAD_JSON', 'Request body is not readable.') };
  }

  if (buf.byteLength === 0) {
    return { ok: false, error: jsonError(400, 'BAD_JSON', 'Request body is empty.') };
  }
  if (buf.byteLength > maxBytes) {
    return {
      ok: false,
      error: jsonError(413, 'BODY_TOO_LARGE', 'Request body is too large.', { maxBytes }),
    };
  }

  try {
    const text = new TextDecoder().decode(buf);
    return { ok: true, value: JSON.parse(text) as T };
  } catch {
    return { ok: false, error: jsonError(400, 'BAD_JSON', 'Request body must be valid JSON.') };
  }
}
