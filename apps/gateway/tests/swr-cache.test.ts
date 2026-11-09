import { describe, expect, it } from 'vitest';

import { buildAnafSuccess } from '../src/core/api-response.js';
import { CircuitBreaker } from '../src/core/circuit-breaker.js';
import { SwrCache } from '../src/core/swr-cache.js';
import { createAnafService } from '../src/services/anaf.service.js';

import { createTestApp } from './helpers/app.js';
import {
  anafPayload,
  createSupabaseMock,
  jsonResponse,
  TEST_API_KEY,
  testEnv,
  VALID_CUI,
} from './helpers/fixtures.js';
import { MemoryRedis } from './helpers/memory-redis.js';

describe('SWR cache', () => {
  it('serves a fresh hit and falls back to an identical stale payload', async () => {
    const clock = { value: Date.parse('2026-11-09T00:00:00.000Z') };
    const now = () => clock.value;
    const redis = new MemoryRedis(now);
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      if (calls > 1) {
        throw new Error('upstream down');
      }
      return jsonResponse(anafPayload());
    };
    const circuit = new CircuitBreaker({ threshold: 5, cooldownMs: 30_000, now });
    const anaf = createAnafService({
      cache: new SwrCache(redis, now),
      circuit,
      fetchImpl,
      url: testEnv.ANAF_API_URL,
      timeoutMs: 3000,
      now,
    });

    const freshHit = await anaf.lookup(VALID_CUI);
    const fresh = buildAnafSuccess(freshHit, {
      requestId: '33333333-3333-4333-8333-333333333333',
      startedAt: clock.value,
      now: clock.value,
    });
    expect(fresh.meta.source).toBe('anaf_api_v8');
    expect(fresh.meta.stale).toBe(false);
    expect(calls).toBe(1);

    clock.value += 60_000;
    const cachedHit = await anaf.lookup(VALID_CUI);
    expect(cachedHit.source).toBe('cache_fresh');
    expect(calls).toBe(1);

    clock.value += 86_400 * 1000;
    const staleHit = await anaf.lookup(VALID_CUI);
    const stale = buildAnafSuccess(staleHit, {
      requestId: '33333333-3333-4333-8333-333333333333',
      startedAt: clock.value,
      now: clock.value,
    });
    expect(stale.data).toEqual(fresh.data);
    expect(stale.meta.stale).toBe(true);
    expect(stale.meta.source).toBe('cache_stale');
    expect(calls).toBe(2);
  });

  it('does not call upstream when the circuit is open and stale data exists', async () => {
    const clock = { value: Date.parse('2026-11-09T00:00:00.000Z') };
    const now = () => clock.value;
    const redis = new MemoryRedis(now);
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      if (calls === 1) {
        return jsonResponse(anafPayload());
      }
      throw new Error('upstream down');
    };
    const circuit = new CircuitBreaker({ threshold: 5, cooldownMs: 60_000, now });
    const anaf = createAnafService({
      cache: new SwrCache(redis, now),
      circuit,
      fetchImpl,
      url: testEnv.ANAF_API_URL,
      timeoutMs: 3000,
      now,
    });
    await anaf.lookup(VALID_CUI);
    clock.value += 86_400 * 1000;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(circuit.execute(async () => Promise.reject(new Error('down')))).rejects.toThrow(
        'down'
      );
    }
    expect(circuit.getState()).toBe('OPEN');
    const before = calls;
    const stale = await anaf.lookup(`RO${VALID_CUI}`);
    expect(calls).toBe(before);
    expect(stale.stale).toBe(true);
    expect(stale.source).toBe('cache_stale');
    expect(stale.circuit_status).toBe('OPEN');
    expect(stale.data.denumire).toBe('TEST SRL');
  });

  it('returns the stale fallback through the REST response', async () => {
    const clock = { value: Date.parse('2026-11-09T00:00:00.000Z') };
    let calls = 0;
    const app = createTestApp({
      now: () => clock.value,
      redis: new MemoryRedis(() => clock.value),
      supabase: createSupabaseMock().port,
      fetchImpl: async () => {
        calls += 1;
        if (calls > 1) {
          throw new Error('upstream down');
        }
        return jsonResponse(anafPayload());
      },
    });
    const headers = { authorization: `Bearer ${TEST_API_KEY}` };
    const first = await app.request(`/api/v1/anaf/cui/${VALID_CUI}`, { headers });
    const freshBody = (await first.json()) as {
      data: { denumire: string };
      meta: { source: string };
    };
    clock.value += 86_400 * 1000 + 5_000;
    const second = await app.request(`/api/v1/anaf/cui/${VALID_CUI}`, { headers });
    const staleBody = (await second.json()) as {
      data: { denumire: string };
      meta: { stale: boolean; source: string };
    };
    expect(second.status).toBe(200);
    expect(staleBody.data).toEqual(freshBody.data);
    expect(staleBody.meta.stale).toBe(true);
    expect(staleBody.meta.source).toBe('cache_stale');
  });
});
