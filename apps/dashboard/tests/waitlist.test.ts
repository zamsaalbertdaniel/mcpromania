import { describe, expect, it } from 'vitest';

import { handleWaitlistPost, type WaitlistRateBucket } from '../lib/waitlist';

const VALID_ENV = {
  WAITLIST_EDGE_URL: 'https://example.supabase.co/functions/v1/waitlist-submit',
  WAITLIST_EDGE_SECRET: 'waitlist-secret-at-least-16-chars',
  SUPABASE_ANON_KEY: 'anon-public-key',
};

const DISTRIBUTED_ENV = {
  ...VALID_ENV,
  UPSTASH_REDIS_REST_URL: 'https://trusting-shiner.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'upstash-rest-token',
  VERCEL_ENV: 'production',
};

function makeRequest(
  body: unknown,
  options?: {
    origin?: string;
    host?: string;
    contentType?: string;
    cfIp?: string;
    cfRay?: string;
    vercelIp?: string;
  }
): Request {
  const headers = new Headers();
  headers.set('content-type', options?.contentType ?? 'application/json');
  headers.set('host', options?.host ?? 'www.mcpromania.ro');
  if (options?.origin) {
    headers.set('origin', options.origin);
  }
  if (options?.cfIp) {
    headers.set('cf-connecting-ip', options.cfIp);
  }
  if (options?.cfRay) {
    headers.set('cf-ray', options.cfRay);
  }
  if (options?.vercelIp) {
    headers.set('x-vercel-forwarded-for', options.vercelIp);
  }
  return new Request(`https://${options?.host ?? 'www.mcpromania.ro'}/api/waitlist`, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/waitlist security & validation', () => {
  it('blocks direct *.vercel.app access in production with 403', async () => {
    const res = await handleWaitlistPost(
      makeRequest(
        { email: 'test@firma.ro', fullName: 'Ion Popescu' },
        { host: 'mcpromania-preview.vercel.app', cfIp: '1.2.3.4' }
      ),
      { env: DISTRIBUTED_ENV }
    );
    expect(res.status).toBe(403);
  });

  it('rejects cross-origin requests with 403', async () => {
    const res = await handleWaitlistPost(
      makeRequest(
        { email: 'test@firma.ro', fullName: 'Ion Popescu' },
        { origin: 'https://evil.example', host: 'www.mcpromania.ro' }
      ),
      { env: VALID_ENV }
    );
    expect(res.status).toBe(403);
  });

  it('rejects non-JSON content types with 415', async () => {
    const res = await handleWaitlistPost(
      makeRequest('email=test@firma.ro', { contentType: 'application/x-www-form-urlencoded' }),
      { env: VALID_ENV }
    );
    expect(res.status).toBe(415);
  });

  it('fails closed with 503 when Edge Function or production Upstash env variables are missing', async () => {
    const resNoEdge = await handleWaitlistPost(
      makeRequest({ email: 'test@firma.ro', fullName: 'Ion Popescu' }),
      { env: {} }
    );
    expect(resNoEdge.status).toBe(503);

    const resProdNoRedis = await handleWaitlistPost(
      makeRequest({ email: 'test@firma.ro', fullName: 'Ion Popescu' }),
      { env: { ...VALID_ENV, VERCEL_ENV: 'production' } }
    );
    expect(resProdNoRedis.status).toBe(503);
  });

  it('silently neutralizes honeypot bot submissions without calling Redis or Edge Function', async () => {
    let fetchCalls = 0;
    const res = await handleWaitlistPost(
      makeRequest({
        email: 'bot@spam.example',
        fullName: 'Spam Bot',
        website: 'https://spam-link.example',
      }),
      {
        env: DISTRIBUTED_ENV,
        fetchImpl: async () => {
          fetchCalls += 1;
          return new Response('{}', { status: 200 });
        },
      }
    );

    expect(res.status).toBe(200);
    expect(fetchCalls).toBe(0);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
  });

  it('ignores spoofed cf-connecting-ip on preview *.vercel.app hosts and uses x-vercel-forwarded-for', async () => {
    const seenIpHashes: string[] = [];
    const deps = {
      env: { ...VALID_ENV, VERCEL_ENV: 'preview' },
      rateStore: new Map<string, WaitlistRateBucket>(),
      fetchImpl: async (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as { ipHash?: string };
        seenIpHashes.push(body.ipHash ?? '');
        return new Response(
          JSON.stringify({
            ok: true,
            leadId: '44444444-4444-4444-8444-444444444444',
            alreadyRegistered: false,
          }),
          { status: 200 }
        );
      },
    };

    // Two requests from the SAME real client IP (203.0.113.9) with DIFFERENT spoofed cf-connecting-ip headers
    await handleWaitlistPost(
      makeRequest(
        { email: 'a@firma.ro', fullName: 'User One' },
        { host: 'preview.vercel.app', vercelIp: '203.0.113.9', cfIp: '10.0.0.1', cfRay: 'fake' }
      ),
      deps
    );
    await handleWaitlistPost(
      makeRequest(
        { email: 'b@firma.ro', fullName: 'User Two' },
        { host: 'preview.vercel.app', vercelIp: '203.0.113.9', cfIp: '10.0.0.2', cfRay: 'fake' }
      ),
      deps
    );

    expect(seenIpHashes).toHaveLength(2);
    expect(seenIpHashes[0]).toBe(seenIpHashes[1]);
  });

  it('uses distributed Upstash Redis EVAL rate limiter in production and fails closed on Redis outage', async () => {
    let evalCount = 0;
    let shouldFailRedis = false;

    const deps = {
      env: DISTRIBUTED_ENV,
      fetchImpl: async (url: string | URL | Request, init?: RequestInit) => {
        const target = String(url);
        if (target.includes('upstash.io')) {
          if (shouldFailRedis) {
            return new Response('Service Unavailable', { status: 503 });
          }
          evalCount += 1;
          const allowed = evalCount <= 2 ? 1 : 0;
          return new Response(JSON.stringify({ result: [allowed, evalCount] }), { status: 200 });
        }
        const body = JSON.parse(String(init?.body ?? '{}')) as { ipHash?: string };
        expect(typeof body.ipHash).toBe('string');
        return new Response(
          JSON.stringify({
            ok: true,
            leadId: '44444444-4444-4444-8444-444444444444',
            alreadyRegistered: false,
          }),
          { status: 200 }
        );
      },
    };

    const ok1 = await handleWaitlistPost(
      makeRequest(
        { email: 'ceo@firma.ro', fullName: 'Maria Ionescu' },
        { cfIp: '198.51.100.42', cfRay: 'abc-OTP', vercelIp: '172.71.0.1' }
      ),
      deps
    );
    expect(ok1.status).toBe(200);

    const ok2 = await handleWaitlistPost(
      makeRequest(
        { email: 'cto@firma.ro', fullName: 'Ion Popescu' },
        { cfIp: '198.51.100.42', cfRay: 'abc-OTP', vercelIp: '172.71.0.1' }
      ),
      deps
    );
    expect(ok2.status).toBe(200);

    const blocked = await handleWaitlistPost(
      makeRequest(
        { email: 'spam@firma.ro', fullName: 'Ion Popescu' },
        { cfIp: '198.51.100.42', cfRay: 'abc-OTP', vercelIp: '172.71.0.1' }
      ),
      deps
    );
    expect(blocked.status).toBe(429);

    shouldFailRedis = true;
    const failClosed = await handleWaitlistPost(
      makeRequest(
        { email: 'outage@firma.ro', fullName: 'Ion Popescu' },
        { cfIp: '198.51.100.42', cfRay: 'abc-OTP', vercelIp: '172.71.0.1' }
      ),
      deps
    );
    expect(failClosed.status).toBe(503);
  });
});
