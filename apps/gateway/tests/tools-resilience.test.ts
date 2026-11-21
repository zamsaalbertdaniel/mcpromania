import { describe, expect, it } from 'vitest';

import { CircuitBreaker } from '../src/core/circuit-breaker.js';

import { createTestApp } from './helpers/app.js';
import {
  anafPayload,
  BNR_XML,
  createSupabaseMock,
  jsonResponse,
  TEST_API_KEY,
  VALID_CUI,
} from './helpers/fixtures.js';

describe('Resilience: Rate Limiting across all tools', () => {
  it('enforces rate limiting and returns X-RateLimit headers on all REST tools and MCP', async () => {
    const supabase = createSupabaseMock();
    const app = createTestApp({
      supabase: supabase.port,
      fetchImpl: async (url) => {
        const u = String(url);
        if (u.includes('bnr.ro')) {
          return new Response(BNR_XML, {
            status: 200,
            headers: { 'content-type': 'application/xml' },
          });
        }
        if (u.includes('just.ro')) {
          return new Response(
            '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><CautareDosareResponse xmlns="portalquery.just.ro"><CautareDosareResult /></CautareDosareResponse></soap:Body></soap:Envelope>',
            { status: 200, headers: { 'content-type': 'text/xml' } }
          );
        }
        return jsonResponse(anafPayload());
      },
    });

    const headers = { authorization: `Bearer ${TEST_API_KEY}` };

    // 1. Tool 1: ANAF
    const resAnaf = await app.request(`/api/v1/anaf/cui/${VALID_CUI}`, { headers });
    expect(resAnaf.status).toBe(200);
    expect(resAnaf.headers.get('x-ratelimit-limit')).toBe('60');
    expect(Number(resAnaf.headers.get('x-ratelimit-remaining'))).toBe(59);

    // 2. Tool 2: BNR
    const resBnr = await app.request('/api/v1/bnr/exchange-rate', { headers });
    expect(resBnr.status).toBe(200);
    expect(resBnr.headers.get('x-ratelimit-limit')).toBe('60');
    expect(Number(resBnr.headers.get('x-ratelimit-remaining'))).toBe(58);

    // 3. Tool 3: IBAN
    const resIban = await app.request('/api/v1/iban/validate/RO37BTRL0000000000000001', {
      headers,
    });
    expect(resIban.status).toBe(200);
    expect(resIban.headers.get('x-ratelimit-limit')).toBe('60');
    expect(Number(resIban.headers.get('x-ratelimit-remaining'))).toBe(57);

    // 4. Tool 4: Portal Just
    const resJust = await app.request('/api/v1/just/cases?query=1/1/2024', { headers });
    expect(resJust.status).toBe(200);
    expect(resJust.headers.get('x-ratelimit-limit')).toBe('60');
    expect(Number(resJust.headers.get('x-ratelimit-remaining'))).toBe(56);

    // 5. Tool 5: ONRC Validate
    const resOnrcVal = await app.request('/api/v1/onrc/validate/J40%2F1234%2F2024', { headers });
    expect(resOnrcVal.status).toBe(200);
    expect(resOnrcVal.headers.get('x-ratelimit-limit')).toBe('60');
    expect(Number(resOnrcVal.headers.get('x-ratelimit-remaining'))).toBe(55);

    // 6. Tool 6: ONRC Company
    const resOnrcComp = await app.request(`/api/v1/onrc/company/${VALID_CUI}`, { headers });
    expect(resOnrcComp.status).toBe(200);
    expect(resOnrcComp.headers.get('x-ratelimit-limit')).toBe('60');
    expect(Number(resOnrcComp.headers.get('x-ratelimit-remaining'))).toBe(54);

    // 7. Tool 7: Insolvency & BPI Check
    const resInsolv = await app.request(`/api/v1/insolvency/check/${VALID_CUI}`, { headers });
    expect(resInsolv.status).toBe(200);
    expect(resInsolv.headers.get('x-ratelimit-limit')).toBe('60');
    expect(Number(resInsolv.headers.get('x-ratelimit-remaining'))).toBe(53);

    // 8. MCP endpoint
    const resMcp = await app.request('/mcp', {
      method: 'POST',
      headers: {
        ...headers,
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
      }),
    });
    expect(resMcp.status).toBe(200);
    expect(resMcp.headers.get('x-ratelimit-limit')).toBe('60');
    expect(Number(resMcp.headers.get('x-ratelimit-remaining'))).toBe(52);
  });

  it('rejects all endpoints with HTTP 429 when quota is exceeded', async () => {
    const supabase = createSupabaseMock();
    const app = createTestApp({
      supabase: supabase.port,
      fetchImpl: async () => jsonResponse(anafPayload()),
    });
    const headers = { authorization: `Bearer ${TEST_API_KEY}` };

    // Consume all 60 requests using fast IBAN validations
    for (let i = 0; i < 60; i += 1) {
      const res = await app.request('/api/v1/iban/validate/RO37BTRL0000000000000001', { headers });
      expect(res.status).toBe(200);
    }

    // 61st request on any tool must return 429 RATE_LIMITED
    const blockedIban = await app.request('/api/v1/iban/validate/RO37BTRL0000000000000001', {
      headers,
    });
    expect(blockedIban.status).toBe(429);
    const ibanJson = (await blockedIban.json()) as { ok: boolean; error: { code: string } };
    expect(ibanJson.ok).toBe(false);
    expect(ibanJson.error.code).toBe('RATE_LIMITED');
    expect(blockedIban.headers.get('x-ratelimit-remaining')).toBe('0');

    // Portal Just also blocked
    const blockedJust = await app.request('/api/v1/just/cases?query=1/1/2024', { headers });
    expect(blockedJust.status).toBe(429);

    // ONRC also blocked
    const blockedOnrc = await app.request('/api/v1/onrc/validate/J40%2F1234%2F2024', { headers });
    expect(blockedOnrc.status).toBe(429);

    // MCP also blocked
    const blockedMcp = await app.request('/mcp', {
      method: 'POST',
      headers: {
        ...headers,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
    });
    expect(blockedMcp.status).toBe(429);
  });
});

describe('Resilience: Circuit Breakers across external upstreams', () => {
  it('opens Portal Just circuit on 5 consecutive failures and reports degraded in /health', async () => {
    const clock = { value: 10_000 };
    const justCircuit = new CircuitBreaker({
      threshold: 5,
      cooldownMs: 30_000,
      now: () => clock.value,
    });

    const supabase = createSupabaseMock();
    const app = createTestApp({
      now: () => clock.value,
      supabase: supabase.port,
      circuits: {
        anaf: new CircuitBreaker({ now: () => clock.value }),
        bnr: new CircuitBreaker({ now: () => clock.value }),
        just: justCircuit,
      },
      fetchImpl: async (url) => {
        const u = String(url);
        if (u.includes('just.ro')) {
          // Simulate Portal Just server error 500
          return new Response('Internal Server Error', { status: 500 });
        }
        return jsonResponse(anafPayload());
      },
    });

    const headers = { authorization: `Bearer ${TEST_API_KEY}` };

    // Initial state: /health is ok, all circuits CLOSED
    const initialHealth = await app.request('/health');
    const h1 = (await initialHealth.json()) as {
      status: string;
      circuits: Record<string, string>;
    };
    expect(h1.status).toBe('ok');
    expect(h1.circuits.just).toBe('CLOSED');

    // Trigger 5 failures on Portal Just
    for (let i = 0; i < 5; i += 1) {
      const res = await app.request(`/api/v1/just/cases?query=fail_${i}`, { headers });
      expect(res.status).toBe(503);
    }

    // Circuit is now OPEN!
    expect(justCircuit.getState()).toBe('OPEN');

    // /health now reports degraded and circuits.just is OPEN
    const degradedHealth = await app.request('/health');
    const h2 = (await degradedHealth.json()) as {
      status: string;
      circuits: Record<string, string>;
    };
    expect(h2.status).toBe('degraded');
    expect(h2.circuits.just).toBe('OPEN');

    // Fast-fail: Next Portal Just request is blocked immediately by Circuit Breaker without calling upstream
    const fastFail = await app.request('/api/v1/just/cases?query=dosar_test', { headers });
    expect(fastFail.status).toBe(503);
    const failJson = (await fastFail.json()) as {
      ok: boolean;
      error: { code: string };
      meta: { circuit_status: string };
    };
    expect(failJson.error.code).toBe('CIRCUIT_OPEN');
    expect(failJson.meta.circuit_status).toBe('OPEN');

    // CRITICAL: Isolated failure! Offline tools and other tools REMAIN fully working!
    const ibanOk = await app.request('/api/v1/iban/validate/RO37BTRL0000000000000001', { headers });
    expect(ibanOk.status).toBe(200);

    const onrcOk = await app.request('/api/v1/onrc/validate/J40%2F1234%2F2024', { headers });
    expect(onrcOk.status).toBe(200);

    // Cooldown & recovery: Advance clock past 30s
    clock.value += 30_000;
    expect(justCircuit.getState()).toBe('HALF_OPEN');
  });

  it('serves stale SWR cache when upstream circuit is OPEN', async () => {
    const clock = { value: 10_000 };
    const anafCircuit = new CircuitBreaker({
      threshold: 5,
      cooldownMs: 30_000,
      now: () => clock.value,
    });

    let failAnaf = false;
    const supabase = createSupabaseMock();
    const app = createTestApp({
      now: () => clock.value,
      supabase: supabase.port,
      circuits: {
        anaf: anafCircuit,
        bnr: new CircuitBreaker({ now: () => clock.value }),
      },
      fetchImpl: async () => {
        if (failAnaf) {
          return new Response('ANAF down', { status: 503 });
        }
        return jsonResponse(anafPayload());
      },
    });

    const headers = { authorization: `Bearer ${TEST_API_KEY}` };

    // 1. Initial successful lookup populates the SWR cache
    const firstRes = await app.request(`/api/v1/anaf/cui/${VALID_CUI}`, { headers });
    expect(firstRes.status).toBe(200);
    const firstJson = (await firstRes.json()) as { meta: { source: string; stale: boolean } };
    expect(firstJson.meta.source).toBe('anaf_api_v8');
    expect(firstJson.meta.stale).toBe(false);

    // 2. Advance time past fresh TTL (86400s) so it becomes STALE (stale TTL is 7 days)
    clock.value += 90_000 * 1000;

    // 3. Make ANAF fail and trip the circuit across 5 attempts
    failAnaf = true;
    for (let i = 0; i < 5; i += 1) {
      const res = await app.request(`/api/v1/anaf/cui/${VALID_CUI}`, { headers });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean; meta: { source: string } };
      expect(body.ok).toBe(true);
      expect(body.meta.source).toBe('cache_stale');
    }
    expect(anafCircuit.getState()).toBe('OPEN');

    // 4. Query the cached CUI again while circuit is OPEN:
    // It MUST serve stale cache with 200 OK and stale: true, rather than failing!
    const staleRes = await app.request(`/api/v1/anaf/cui/${VALID_CUI}`, { headers });
    expect(staleRes.status).toBe(200);
    const staleJson = (await staleRes.json()) as {
      ok: boolean;
      meta: { source: string; stale: boolean; circuit_status: string };
    };
    expect(staleJson.ok).toBe(true);
    expect(staleJson.meta.source).toBe('cache_stale');
    expect(staleJson.meta.stale).toBe(true);
    expect(staleJson.meta.circuit_status).toBe('OPEN');
  });
});
