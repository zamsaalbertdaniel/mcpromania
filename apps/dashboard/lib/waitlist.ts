import { createHmac } from 'node:crypto';

import { WaitlistSubmissionSchema } from '@mcpromania/types';

const MAX_BODY_BYTES = 8_192;
const EDGE_TIMEOUT_MS = 4_000;
const REDIS_TIMEOUT_MS = 2_000;
const RATE_LIMIT_MAX_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_SECONDS = 15 * 60;
const RATE_LIMIT_WINDOW_MS = RATE_LIMIT_WINDOW_SECONDS * 1000;
const MAX_TRACKED_IPS = 5_000;

const RATE_LIMIT_LUA = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
end
if count > tonumber(ARGV[1]) then
  return {0, count}
end
return {1, count}
`;

export type WaitlistRateBucket = {
  count: number;
  resetAt: number;
};

export type WaitlistDeps = {
  env: {
    WAITLIST_EDGE_URL?: string;
    WAITLIST_EDGE_SECRET?: string;
    SUPABASE_ANON_KEY?: string;
    UPSTASH_REDIS_REST_URL?: string;
    UPSTASH_REDIS_REST_TOKEN?: string;
    VERCEL_ENV?: string;
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

function getRequestHost(req: Request): string {
  const raw = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '';
  return raw.split(',')[0].trim().toLowerCase();
}

function isSameOrigin(req: Request, host: string): boolean {
  const origin = req.headers.get('origin');
  if (!origin) {
    return true;
  }
  if (!host) {
    return false;
  }
  try {
    return new URL(origin).host.toLowerCase() === host;
  } catch {
    return false;
  }
}

function extractClientIp(req: Request, host: string): string {
  // Vercel sets x-vercel-forwarded-for & x-real-ip from the actual peer connection
  // and overwrites client-supplied x-forwarded-for. Clients hitting *.vercel.app directly
  // could spoof cf-connecting-ip, so never trust cf-connecting-ip on *.vercel.app hosts.
  const isVercelDeploymentHost = host.endsWith('.vercel.app');
  const vercelEdgeIp =
    req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip')?.trim() ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();

  if (isVercelDeploymentHost) {
    return vercelEdgeIp || 'unknown';
  }

  // On custom domain behind Cloudflare, cf-connecting-ip carries the end-user IP when cf-ray is present.
  const cfIp = req.headers.get('cf-connecting-ip')?.trim();
  const hasCfRay = Boolean(req.headers.get('cf-ray')?.trim());
  if (cfIp && hasCfRay) {
    return cfIp;
  }

  return vercelEdgeIp || cfIp || 'unknown';
}

function checkLocalMemoryRateLimit(
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

async function checkDistributedRedisRateLimit(
  fetchFn: typeof fetch,
  restUrl: string,
  restToken: string,
  ipHash: string
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REDIS_TIMEOUT_MS);

  try {
    const endpoint = restUrl.replace(/\/+$/, '');
    const res = await fetchFn(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${restToken}`,
      },
      body: JSON.stringify([
        'EVAL',
        RATE_LIMIT_LUA,
        1,
        `mcpr:waitlist:rl:${ipHash}`,
        RATE_LIMIT_MAX_ATTEMPTS,
        RATE_LIMIT_WINDOW_SECONDS,
      ]),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Upstash REST HTTP ${res.status}`);
    }

    const data = (await res.json()) as { result?: unknown; error?: string };
    if (data.error || !Array.isArray(data.result)) {
      throw new Error(data.error ?? 'Invalid Upstash EVAL response');
    }

    return Number(data.result[0]) === 1;
  } finally {
    clearTimeout(timer);
  }
}

export async function handleWaitlistPost(req: Request, deps: WaitlistDeps): Promise<Response> {
  const host = getRequestHost(req);

  // Block direct access to *.vercel.app deployment URL in production so traffic cannot bypass Cloudflare/custom domain rules.
  if (deps.env.VERCEL_ENV === 'production' && host.endsWith('.vercel.app')) {
    return jsonResponse({ ok: false, error: 'Accesul direct pe acest host nu este permis.' }, 403);
  }

  if (!isSameOrigin(req, host)) {
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

  const upstashUrl = deps.env.UPSTASH_REDIS_REST_URL?.trim();
  const upstashToken = deps.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  const hasDistributedRedis = Boolean(upstashUrl && upstashToken);

  if (deps.env.VERCEL_ENV === 'production' && !hasDistributedRedis) {
    console.error('UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN missing in production');
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

  // Honeypot anti-bot trap: pretend success without hitting Redis/Supabase
  if (typeof rawBody.website === 'string' && rawBody.website.trim().length > 0) {
    return jsonResponse({
      ok: true,
      alreadyRegistered: false,
      message: 'Cererea dumneavoastră a fost înregistrată. Vă vom contacta în curând.',
    });
  }

  const fetchFn = deps.fetchImpl ?? fetch;
  const nowMs = (deps.now ?? Date.now)();
  const ip = extractClientIp(req, host);
  const ipHash = createHmac('sha256', edgeSecret).update(ip).digest('hex');

  if (hasDistributedRedis && upstashUrl && upstashToken) {
    try {
      const allowed = await checkDistributedRedisRateLimit(
        fetchFn,
        upstashUrl,
        upstashToken,
        ipHash
      );
      if (!allowed) {
        return jsonResponse(
          {
            ok: false,
            error: 'Prea multe încercări. Vă rugăm să încercați din nou peste 15 minute.',
          },
          429
        );
      }
    } catch (error) {
      console.error(
        'Waitlist Redis rate-limit error, failing closed:',
        error instanceof Error ? error.message : 'unknown error'
      );
      return jsonResponse(
        { ok: false, error: 'Serviciul de protecție anti-abuz este temporar indisponibil.' },
        503
      );
    }
  } else {
    const store = deps.rateStore ?? defaultRateStore;
    if (!checkLocalMemoryRateLimit(store, ipHash, nowMs)) {
      return jsonResponse(
        {
          ok: false,
          error: 'Prea multe încercări. Vă rugăm să încercați din nou peste 15 minute.',
        },
        429
      );
    }
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
