import { describe, expect, it } from 'vitest';

import { createTestApp } from './helpers/app.js';
import {
  anafPayload,
  createSupabaseMock,
  jsonResponse,
  TEST_API_KEY,
  VALID_CUI,
} from './helpers/fixtures.js';

describe('rate limiter', () => {
  it('allows 60 requests per minute and rejects the 61st with 429', async () => {
    const supabase = createSupabaseMock();
    const app = createTestApp({
      supabase: supabase.port,
      fetchImpl: async () => jsonResponse(anafPayload()),
    });

    let lastRemaining = 60;
    for (let attempt = 1; attempt <= 60; attempt += 1) {
      const response = await app.request(`/api/v1/anaf/cui/${VALID_CUI}`, {
        headers: { authorization: `Bearer ${TEST_API_KEY}` },
      });
      expect(response.status).toBe(200);
      lastRemaining = Number(response.headers.get('x-ratelimit-remaining'));
      expect(response.headers.get('x-ratelimit-limit')).toBe('60');
    }
    expect(lastRemaining).toBe(0);

    const blocked = await app.request(`/api/v1/anaf/cui/${VALID_CUI}`, {
      headers: { authorization: `Bearer ${TEST_API_KEY}` },
    });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('x-ratelimit-remaining')).toBe('0');
    const body = (await blocked.json()) as { ok: boolean; error: { code: string } };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('RATE_LIMITED');
  });

  it('does not count rejected requests towards rate limit so window is not extended', async () => {
    const clock = { value: Date.parse('2026-11-09T00:00:00.000Z') };
    const supabase = createSupabaseMock();
    const app = createTestApp({
      now: () => clock.value,
      supabase: supabase.port,
      fetchImpl: async () => jsonResponse(anafPayload()),
    });

    for (let attempt = 1; attempt <= 60; attempt += 1) {
      const response = await app.request(`/api/v1/anaf/cui/${VALID_CUI}`, {
        headers: { authorization: `Bearer ${TEST_API_KEY}` },
      });
      expect(response.status).toBe(200);
    }

    // 61st and 62nd are rejected
    clock.value += 10_000;
    const blocked1 = await app.request(`/api/v1/anaf/cui/${VALID_CUI}`, {
      headers: { authorization: `Bearer ${TEST_API_KEY}` },
    });
    expect(blocked1.status).toBe(429);

    clock.value += 10_000;
    const blocked2 = await app.request(`/api/v1/anaf/cui/${VALID_CUI}`, {
      headers: { authorization: `Bearer ${TEST_API_KEY}` },
    });
    expect(blocked2.status).toBe(429);

    // Advance clock past the initial 60s window (now 61s from start)
    // The first 60 requests expired. If blocked1 and blocked2 were recorded, they would still count!
    clock.value = Date.parse('2026-11-09T00:01:01.000Z');
    const allowedAfterWindow = await app.request(`/api/v1/anaf/cui/${VALID_CUI}`, {
      headers: { authorization: `Bearer ${TEST_API_KEY}` },
    });
    expect(allowedAfterWindow.status).toBe(200);
  });

  it('fails open when redis encounters an error', async () => {
    const failingRedis = {
      status: 'ready',
      get: async () => {
        throw new Error('Redis connection refused');
      },
      set: async () => {
        throw new Error('Redis connection refused');
      },
      ping: async () => {
        throw new Error('Redis connection refused');
      },
      quit: async () => {},
      multi: () => {
        throw new Error('Redis connection refused');
      },
    };

    const supabase = createSupabaseMock();
    const app = createTestApp({
      redis: failingRedis,
      supabase: supabase.port,
      fetchImpl: async () => jsonResponse(anafPayload()),
    });

    const response = await app.request(`/api/v1/anaf/cui/${VALID_CUI}`, {
      headers: { authorization: `Bearer ${TEST_API_KEY}` },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });
});
