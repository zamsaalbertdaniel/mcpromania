import { createHmac } from 'node:crypto';

import { WaitlistSubmissionSchema } from '@mcpromania/types';

const MAX_BODY_BYTES = 8_192;
const EDGE_TIMEOUT_MS = 4_000;
const RATE_LIMIT_MAX_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const MAX_TRACKED_IPS = 5_000;

export type WaitlistRateBucket = {
  count: number;
  resetAt: number;
};

export type WaitlistDeps = {
  env: {
    WAITLIST_EDGE_URL?: string;
    WAITLIST_EDGE_SECRET?: string;
    SUPABASE_ANON_KEY?: string;
  };
  fetchImpl?: typeof fetch;
  now?: () => number;
  rateStore?: Map<string, WaitlistRateBucket>;
};

const defaultRateStore = new Map<string, WaitlistRateBucket>();

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) {
    return true;
  }
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (!host) {
    return false;
  }
  try {
    return new URL(origin).host.toLowerCase() === host.split(',')[0].trim().toLowerCase();
  } catch {
    return false;
  }
}

function extractClientIp(req: Request): string {
  const raw =
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-real-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0] ??
    'unknown';
  return raw.trim() || 'unknown';
}

function checkRateLimit(
  store: Map<string, WaitlistRateBucket>,
  key: string,
  nowMs: number
): boolean {
  if (store.size >= MAX_TRACKED_IPS) {
    for (const [k, entry] of store) {
      if (entry.resetAt <= nowMs) {
        store.delete(k);
      }
    }
    if (store.size >= MAX_TRACKED_IPS) {
      const oldestKey = store.keys().next().value;
      if (oldestKey) {
        store.delete(oldestKey);
      }
    }
  }

  const existing = store.get(key);
  if (!existing || existing.resetAt <= nowMs) {
    store.set(key, { count: 1, resetAt: nowMs + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (existing.count >= RATE_LIMIT_MAX_ATTEMPTS) {
    return false;
  }

  existing.count += 1;
  return true;
}

export async function handleWaitlistPost(req: Request, deps: WaitlistDeps): Promise<Response> {
  if (!isSameOrigin(req)) {
    return jsonResponse({ ok: false, error: 'Origine neautorizată' }, 403);
  }

  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return jsonResponse({ ok: false, error: 'Tip de conținut invalid' }, 415);
  }

  const edgeUrl = deps.env.WAITLIST_EDGE_URL?.trim();
  const edgeSecret = deps.env.WAITLIST_EDGE_SECRET?.trim();
  if (!edgeUrl || !edgeSecret || edgeSecret.length < 16) {
    return jsonResponse(
      { ok: false, error: 'Serviciul de înscrieri este temporar indisponibil.' },
      503
    );
  }

  const rawText = await req.text();
  if (new TextEncoder().encode(rawText).length > MAX_BODY_BYTES) {
    return jsonResponse({ ok: false, error: 'Cererea depășește dimensiunea permisă.' }, 413);
  }

  let rawBody: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rawText);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return jsonResponse({ ok: false, error: 'Format JSON invalid.' }, 400);
    }
    rawBody = parsed as Record<string, unknown>;
  } catch {
    return jsonResponse({ ok: false, error: 'JSON invalid.' }, 400);
  }

  // Honeypot anti-bot trap: pretend success without hitting Supabase
  if (typeof rawBody.website === 'string' && rawBody.website.trim().length > 0) {
    return jsonResponse({
      ok: true,
      alreadyRegistered: false,
      message: 'Cererea dumneavoastră a fost înregistrată. Vă vom contacta în curând.',
    });
  }

  const nowMs = (deps.now ?? Date.now)();
  const store = deps.rateStore ?? defaultRateStore;
  const ip = extractClientIp(req);
  const ipHash = createHmac('sha256', edgeSecret).update(ip).digest('hex');

  if (!checkRateLimit(store, ipHash, nowMs)) {
    return jsonResponse(
      { ok: false, error: 'Prea multe încercări. Vă rugăm să încercați din nou peste 15 minute.' },
      429
    );
  }

  const parsedSubmission = WaitlistSubmissionSchema.safeParse(rawBody);
  if (!parsedSubmission.success) {
    const firstIssue = parsedSubmission.error.issues[0];
    return jsonResponse(
      { ok: false, error: firstIssue?.message ?? 'Datele introduse nu sunt valide.' },
      400
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EDGE_TIMEOUT_MS);
  const fetchFn = deps.fetchImpl ?? fetch;

  try {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-waitlist-edge-secret': edgeSecret,
    };
    const anonKey = deps.env.SUPABASE_ANON_KEY?.trim();
    if (anonKey) {
      headers.authorization = `Bearer ${anonKey}`;
    }

    const upstreamRes = await fetchFn(edgeUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...parsedSubmission.data,
        ipHash,
      }),
      signal: controller.signal,
    });

    if (!upstreamRes.ok) {
      return jsonResponse(
        { ok: false, error: 'Nu am putut procesa înscrierea momentan. Încercați mai târziu.' },
        502
      );
    }

    const upstreamData = (await upstreamRes.json()) as {
      ok?: boolean;
      alreadyRegistered?: boolean;
    };

    if (!upstreamData.ok) {
      return jsonResponse(
        { ok: false, error: 'Nu am putut procesa înscrierea momentan. Încercați mai târziu.' },
        502
      );
    }

    const alreadyRegistered = Boolean(upstreamData.alreadyRegistered);
    return jsonResponse({
      ok: true,
      alreadyRegistered,
      message: alreadyRegistered
        ? 'Această adresă de email este deja înregistrată pe lista de așteptare.'
        : 'Cererea dumneavoastră a fost înregistrată. Veți primi acces în ordine.',
    });
  } catch (error) {
    console.error(
      'Waitlist upstream error:',
      error instanceof Error ? error.message : 'unknown error'
    );
    return jsonResponse({ ok: false, error: 'Serviciul de înscrieri nu răspunde momentan.' }, 503);
  } finally {
    clearTimeout(timer);
  }
}
