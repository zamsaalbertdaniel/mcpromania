import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import type { GatewayEnv } from '../src/config/env.js';

describe('GET /openapi.json', () => {
  it('serves the full OpenAPI 3.1 specification without authentication', async () => {
    const memory = new Map<string, string>();
    const redis = {
      get: async (k: string) => memory.get(k) ?? null,
      set: async (k: string, v: string) => {
        memory.set(k, v);
        return 'OK';
      },
      del: async (k: string) => {
        memory.delete(k);
        return 1;
      },
      ping: async () => 'PONG',
      multi: () => {
        const queue: Array<() => unknown> = [];
        return {
          incr: (k: string) => {
            queue.push(() => {
              const current = Number(memory.get(k) ?? '0');
              const next = current + 1;
              memory.set(k, String(next));
              return next;
            });
            return queue[queue.length - 1];
          },
          pttl: (_k: string) => {
            queue.push(() => 60_000);
            return queue[queue.length - 1];
          },
          pexpire: (_k: string, _ms: number) => {
            queue.push(() => 1);
            return queue[queue.length - 1];
          },
          exec: async () => queue.map((fn) => [null, fn()]),
        };
      },
    };

    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: {
                id: 'key_1',
                workspace_id: 'ws_1',
                key_hash: 'hash',
                is_active: true,
                rate_limit_per_min: 1000,
                plan_tier: 'pro',
              },
              error: null,
            }),
          }),
        }),
        insert: async () => ({ error: null }),
      }),
    };

    const env: GatewayEnv = {
      NODE_ENV: 'test',
      PORT: 4000,
      REDIS_URL: 'redis://localhost:6379',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-key',
      MASTER_API_KEY: 'mcpr_live_secret123',
      ANAF_API_URL: 'https://webservicesp.anaf.ro/PlatitorTvaRest/api/v8/ws/tva',
      JUST_API_URL: 'http://portalquery.just.ro/query.asmx',
      JUST_REQUEST_TIMEOUT_MS: 5000,
      BNR_XML_URL: 'https://www.bnr.ro/nbrfxrates.xml',
      RATE_LIMIT_PER_MINUTE: 1000,
      REQUEST_TIMEOUT_MS: 5000,
      CIRCUIT_FAILURE_THRESHOLD: 5,
      CIRCUIT_COOLDOWN_MS: 30000,
      SWR_FRESH_TTL_SEC: 86400,
      SWR_STALE_TTL_SEC: 604800,
      LOG_LEVEL: 'silent',
    };

    const app = createApp({ env, redis, supabase });

    const res = await app.request('/openapi.json');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');

    const body = await res.json();
    expect(body.openapi).toBe('3.1.0');
    expect(body.info.title).toContain('MCP România');

    // Verify all 7 active tool endpoints are present in OpenAPI paths
    expect(body.paths['/api/v1/insolvency/check/{cui}']).toBeDefined();
    expect(body.paths['/api/v1/anaf/cui/{cui}']).toBeDefined();
    expect(body.paths['/api/v1/just/cases']).toBeDefined();
    expect(body.paths['/api/v1/bnr/exchange-rate']).toBeDefined();
    expect(body.paths['/api/v1/iban/validate/{iban}']).toBeDefined();
    expect(body.paths['/api/v1/onrc/validate/{regNumber}']).toBeDefined();
    expect(body.paths['/api/v1/onrc/company/{cui}']).toBeDefined();
  });
});
