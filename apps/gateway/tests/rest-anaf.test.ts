import { describe, expect, it } from 'vitest';

import { createTestApp } from './helpers/app.js';
import {
  anafPayload,
  createSupabaseMock,
  jsonResponse,
  TEST_API_KEY,
  VALID_CUI,
} from './helpers/fixtures.js';

describe('GET /api/v1/anaf/cui/:cui', () => {
  it('requires a bearer key, rejects an invalid CUI, and returns the unified payload', async () => {
    const records: Array<{ route: string }> = [];
    let releaseLog: () => void = () => undefined;
    const logGate = new Promise<void>((resolve) => {
      releaseLog = resolve;
    });
    const supabase = createSupabaseMock({
      onRecord: async (input) => {
        records.push(input);
        await logGate;
      },
    });
    const app = createTestApp({
      supabase: supabase.port,
      fetchImpl: async (_input, init) => {
        expect(init?.signal).toBeInstanceOf(AbortSignal);
        return jsonResponse(anafPayload());
      },
    });

    const missing = await app.request(`/api/v1/anaf/cui/${VALID_CUI}`);
    expect(missing.status).toBe(401);

    const invalidKey = await app.request(`/api/v1/anaf/cui/${VALID_CUI}`, {
      headers: { authorization: 'Bearer wrong-key' },
    });
    expect(invalidKey.status).toBe(401);

    const invalidCui = await app.request('/api/v1/anaf/cui/14399841', {
      headers: { authorization: `Bearer ${TEST_API_KEY}` },
    });
    expect(invalidCui.status).toBe(400);
    const invalidBody = (await invalidCui.json()) as { error: { code: string } };
    expect(invalidBody.error.code).toBe('INVALID_CUI');

    const responsePromise = Promise.resolve(
      app.request(`/api/v1/anaf/cui/RO${VALID_CUI}`, {
        headers: { authorization: `Bearer ${TEST_API_KEY}` },
      })
    );
    const winner = await Promise.race([
      responsePromise.then((response) => ({ type: 'http' as const, response })),
      new Promise<{ type: 'timeout' }>((resolve) => {
        setTimeout(() => resolve({ type: 'timeout' }), 500);
      }),
    ]);
    expect(winner.type).toBe('http');
    if (winner.type !== 'http') {
      return;
    }
    expect(winner.response.status).toBe(200);
    const body = (await winner.response.json()) as {
      ok: boolean;
      data: { cui: string; denumire: string; scpTva: boolean };
      meta: {
        source: string;
        stale: boolean;
        request_id: string;
        circuit_status: string;
        execution_time_ms: number;
      };
    };
    expect(body.ok).toBe(true);
    expect(body.data).toMatchObject({ cui: VALID_CUI, denumire: 'TEST SRL', scpTva: true });
    expect(body.meta).toMatchObject({
      source: 'anaf_api_v8',
      stale: false,
      circuit_status: 'CLOSED',
    });
    expect(body.meta.request_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(body.meta.execution_time_ms).toBeGreaterThanOrEqual(0);
    expect(records).toEqual([
      expect.objectContaining({ route: '/api/v1/anaf/cui/:cui' }),
      expect.objectContaining({ route: '/api/v1/anaf/cui/:cui' }),
    ]);

    const cached = await app.request(`/api/v1/anaf/cui/${VALID_CUI}?apiKey=${TEST_API_KEY}`);
    expect(cached.status).toBe(200);
    expect(supabase.verifyCalls[0]).toBe(2);
    releaseLog();
  });
});
