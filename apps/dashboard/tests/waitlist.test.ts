import { describe, expect, it } from 'vitest';

import { handleWaitlistPost, type WaitlistRateBucket } from '../lib/waitlist';

const VALID_ENV = {
  WAITLIST_EDGE_URL: 'https://example.supabase.co/functions/v1/waitlist-submit',
  WAITLIST_EDGE_SECRET: 'waitlist-secret-at-least-16-chars',
  SUPABASE_ANON_KEY: 'anon-public-key',
};

function makeRequest(
  body: unknown,
  options?: {
    origin?: string;
    host?: string;
    contentType?: string;
    ip?: string;
  }
): Request {
  const headers = new Headers();
  headers.set('content-type', options?.contentType ?? 'application/json');
  headers.set('host', options?.host ?? 'mcpromania.ro');
  if (options?.origin) {
    headers.set('origin', options.origin);
  }
  if (options?.ip) {
    headers.set('cf-connecting-ip', options.ip);
  }
  return new Request('https://mcpromania.ro/api/waitlist', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/waitlist security & validation', () => {
  it('rejects cross-origin requests with 403', async () => {
    const res = await handleWaitlistPost(
      makeRequest(
        { email: 'test@firma.ro', fullName: 'Ion Popescu' },
        { origin: 'https://evil.example', host: 'mcpromania.ro' }
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

  it('fails closed with 503 when Edge Function env variables are missing', async () => {
    const res = await handleWaitlistPost(
      makeRequest({ email: 'test@firma.ro', fullName: 'Ion Popescu' }),
      { env: {} }
    );
    expect(res.status).toBe(503);
  });

  it('silently neutralizes honeypot bot submissions without calling Edge Function', async () => {
    let fetchCalls = 0;
    const res = await handleWaitlistPost(
      makeRequest({
        email: 'bot@spam.example',
        fullName: 'Spam Bot',
        website: 'https://spam-link.example',
      }),
      {
        env: VALID_ENV,
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

  it('validates email and fullName strictly before calling Edge Function', async () => {
    let fetchCalls = 0;
    const res = await handleWaitlistPost(makeRequest({ email: 'invalid-email', fullName: 'A' }), {
      env: VALID_ENV,
      rateStore: new Map(),
      fetchImpl: async () => {
        fetchCalls += 1;
        return new Response('{}', { status: 200 });
      },
    });
    expect(res.status).toBe(400);
    expect(fetchCalls).toBe(0);
  });

  it('forwards validated lead with HMAC ipHash and secret headers, and handles duplicates', async () => {
    const calls: Array<{ url: string; headers: Headers; body: Record<string, unknown> }> = [];
    let isDup = false;

    const deps = {
      env: VALID_ENV,
      rateStore: new Map<string, WaitlistRateBucket>(),
      fetchImpl: async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({
          url: String(url),
          headers: new Headers(init?.headers),
          body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
        });
        return new Response(
          JSON.stringify({
            ok: true,
            leadId: '44444444-4444-4444-8444-444444444444',
            alreadyRegistered: isDup,
          }),
          { status: 200 }
        );
      },
    };

    const res1 = await handleWaitlistPost(
      makeRequest(
        {
          email: '  CEO@FirmaMea.RO ',
          fullName: 'Maria Ionescu',
          companyName: 'Firma Mea SRL',
          planTier: 'pro',
          useCase: 'Verificare automata CUI din ERP',
        },
        { origin: 'https://mcpromania.ro', ip: '192.0.2.10' }
      ),
      deps
    );
    expect(res1.status).toBe(200);
    const body1 = (await res1.json()) as { ok: boolean; alreadyRegistered: boolean };
    expect(body1).toMatchObject({ ok: true, alreadyRegistered: false });
    expect(calls[0]?.headers.get('x-waitlist-edge-secret')).toBe(VALID_ENV.WAITLIST_EDGE_SECRET);
    expect(calls[0]?.headers.get('authorization')).toBe(`Bearer ${VALID_ENV.SUPABASE_ANON_KEY}`);
    expect(calls[0]?.body.email).toBe('ceo@firmamea.ro');
    expect(typeof calls[0]?.body.ipHash).toBe('string');
    expect(String(calls[0]?.body.ipHash)).toHaveLength(64);

    isDup = true;
    const res2 = await handleWaitlistPost(
      makeRequest({ email: 'ceo@firmamea.ro', fullName: 'Maria Ionescu' }, { ip: '192.0.2.10' }),
      deps
    );
    expect(res2.status).toBe(200);
    const body2 = (await res2.json()) as { ok: boolean; alreadyRegistered: boolean };
    expect(body2.alreadyRegistered).toBe(true);
  });

  it('rate-limits abusive IP after 5 requests within 15 minutes', async () => {
    const rateStore = new Map<string, WaitlistRateBucket>();
    const deps = {
      env: VALID_ENV,
      rateStore,
      now: () => 1_700_000_000_000,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            ok: true,
            leadId: '44444444-4444-4444-8444-444444444444',
            alreadyRegistered: false,
          }),
          { status: 200 }
        ),
    };

    for (let i = 0; i < 5; i += 1) {
      const okRes = await handleWaitlistPost(
        makeRequest({ email: `user${i}@firma.ro`, fullName: 'User Test' }, { ip: '198.51.100.7' }),
        deps
      );
      expect(okRes.status).toBe(200);
    }

    const blocked = await handleWaitlistPost(
      makeRequest({ email: 'user6@firma.ro', fullName: 'User Test' }, { ip: '198.51.100.7' }),
      deps
    );
    expect(blocked.status).toBe(429);
  });
});
