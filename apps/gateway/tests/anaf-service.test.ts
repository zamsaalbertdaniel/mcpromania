import { describe, expect, it } from 'vitest';

import { CircuitBreaker } from '../src/core/circuit-breaker.js';
import { SwrCache } from '../src/core/swr-cache.js';
import {
  createAnafService,
  DEFAULT_ANAF_API_URL,
  resolveAnafUrl,
} from '../src/services/anaf.service.js';

import { anafPayload, jsonResponse, VALID_CUI } from './helpers/fixtures.js';
import { MemoryRedis } from './helpers/memory-redis.js';

describe('AnafService', () => {
  it('resolves deprecated v8 URLs to the active v9 endpoint', () => {
    expect(resolveAnafUrl('https://webservicesp.anaf.ro/PlatitorTvaRest/api/v8/ws/tva')).toBe(
      DEFAULT_ANAF_API_URL
    );
    expect(resolveAnafUrl('https://api.anaf.ro/PlatitorTvaRest/api/v8/ws/tva')).toBe(
      DEFAULT_ANAF_API_URL
    );
    expect(resolveAnafUrl(undefined)).toBe(DEFAULT_ANAF_API_URL);
    expect(resolveAnafUrl('https://custom.internal.proxy/anaf')).toBe(
      'https://custom.internal.proxy/anaf'
    );
  });

  it('sends correct POST JSON payload to ANAF endpoint and returns parsed company', async () => {
    const clock = { value: Date.parse('2026-11-09T10:00:00.000Z') };
    const now = () => clock.value;
    const redis = new MemoryRedis(now);
    const circuit = new CircuitBreaker({ threshold: 5, cooldownMs: 30_000, now });

    let capturedUrl = '';
    let capturedMethod = '';
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: unknown = null;

    const fetchImpl: typeof fetch = async (input, init) => {
      capturedUrl = String(input);
      capturedMethod = init?.method ?? '';
      capturedHeaders = (init?.headers ?? {}) as Record<string, string>;
      capturedBody = init?.body ? JSON.parse(String(init.body)) : null;
      return jsonResponse(anafPayload());
    };

    const anaf = createAnafService({
      cache: new SwrCache(redis, now),
      circuit,
      fetchImpl,
      url: 'https://webservicesp.anaf.ro/PlatitorTvaRest/api/v8/ws/tva', // deprecated URL passed, should be auto-resolved
      timeoutMs: 3000,
      now,
    });

    const result = await anaf.lookup(VALID_CUI);

    expect(capturedUrl).toBe(DEFAULT_ANAF_API_URL);
    expect(capturedMethod).toBe('POST');
    expect(capturedHeaders['Content-Type']).toBe('application/json');
    expect(capturedHeaders['Accept']).toBe('application/json');
    expect(capturedBody).toEqual([
      {
        cui: Number(VALID_CUI),
        data: '2026-11-09',
      },
    ]);

    expect(result.source).toBe('anaf_api_v8');
    expect(result.stale).toBe(false);
    expect(result.circuit_status).toBe('CLOSED');
    expect(result.data.cui).toBe(VALID_CUI);
    expect(result.data.denumire).toBe('TEST SRL');
    expect(result.data.scpTva).toBe(true);
    expect(result.data.adresaSediuSocial.judet).toBe('Bucuresti');
  });

  it('throws 404 COMPANY_NOT_FOUND when CUI is returned in notFound array', async () => {
    const clock = { value: Date.parse('2026-11-09T10:00:00.000Z') };
    const now = () => clock.value;
    const redis = new MemoryRedis(now);
    const circuit = new CircuitBreaker({ threshold: 5, cooldownMs: 30_000, now });

    const fetchImpl: typeof fetch = async () => {
      return jsonResponse({
        found: [],
        notFound: [Number(VALID_CUI)],
      });
    };

    const anaf = createAnafService({
      cache: new SwrCache(redis, now),
      circuit,
      fetchImpl,
      url: DEFAULT_ANAF_API_URL,
      timeoutMs: 3000,
      now,
    });

    await expect(anaf.lookup(VALID_CUI)).rejects.toMatchObject({
      status: 404,
      code: 'COMPANY_NOT_FOUND',
    });
    // Business 404 must not trip the circuit breaker
    expect(circuit.getState()).toBe('CLOSED');
  });

  it('trips circuit breaker on repeated upstream failures and preserves SWR cache stale fallback', async () => {
    const clock = { value: Date.parse('2026-11-09T10:00:00.000Z') };
    const now = () => clock.value;
    const redis = new MemoryRedis(now);
    const circuit = new CircuitBreaker({ threshold: 2, cooldownMs: 30_000, now });

    let fail = false;
    const fetchImpl: typeof fetch = async () => {
      if (fail) {
        throw new Error('ANAF HTTP 500');
      }
      return jsonResponse(anafPayload());
    };

    const anaf = createAnafService({
      cache: new SwrCache(redis, now),
      circuit,
      fetchImpl,
      url: DEFAULT_ANAF_API_URL,
      timeoutMs: 3000,
      now,
    });

    // Populate cache
    const fresh = await anaf.lookup(VALID_CUI);
    expect(fresh.source).toBe('anaf_api_v8');

    // Make cache stale
    clock.value += 86_400 * 1000 + 1000;
    fail = true;

    // Fail 1: returns stale hit because stale cache exists
    const stale1 = await anaf.lookup(VALID_CUI);
    expect(stale1.source).toBe('cache_stale');
    expect(stale1.stale).toBe(true);

    // Fail 2: trips circuit to OPEN
    const stale2 = await anaf.lookup(VALID_CUI);
    expect(stale2.source).toBe('cache_stale');
    expect(circuit.getState()).toBe('OPEN');
  });
});
