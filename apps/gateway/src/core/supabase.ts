import { PlanTierSchema } from '@mcpromania/types';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { GatewayEnv } from '../config/env.js';

import { AppError } from './errors.js';
import type { AuthContext } from './types.js';

const VerifyRowSchema = z.object({
  api_key_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  key_name: z.string().min(1),
  plan_tier: PlanTierSchema,
  monthly_limit: z.number().int().positive(),
});

const RevokeResponseSchema = z.object({
  ok: z.literal(true),
  revokedCount: z.number().int().nonnegative(),
  apiKeyIds: z.array(z.string().uuid()),
  keyHashes: z.array(z.string()),
});

const UsageResponseSchema = z.object({
  ok: z.literal(true),
});

export type UsageLogInput = {
  tenantId: string;
  apiKeyId: string;
  route: string;
  idempotencyKey?: string;
};

export type RevokeKeyInput = {
  apiKeyId?: string;
  keyHash?: string;
};

export type RevokeKeyResult = {
  persisted: boolean;
  revokedCount: number;
  apiKeyIds: string[];
  keyHashes: string[];
};

export interface SupabasePort {
  verifyApiKey(keyHash: string): Promise<AuthContext | null>;
  recordUsageLog(input: UsageLogInput): Promise<void>;
  revokeApiKeyPersistent?(input: RevokeKeyInput): Promise<RevokeKeyResult>;
}

const ADMIN_EDGE_TIMEOUT_MS = 3000;

async function callGatewayAdminEdge(
  env: GatewayEnv,
  fetchImpl: typeof fetch,
  payload: Record<string, unknown>
): Promise<unknown> {
  if (!env.GATEWAY_ADMIN_URL || !env.GATEWAY_EDGE_SECRET) {
    throw new Error('Gateway admin Edge Function is not configured');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ADMIN_EDGE_TIMEOUT_MS);

  try {
    const response = await fetchImpl(env.GATEWAY_ADMIN_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
        'x-gateway-edge-secret': env.GATEWAY_EDGE_SECRET,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new AppError(503, 'ADMIN_EDGE_UNAVAILABLE', `Edge Function error (${response.status})`);
    }

    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

export function createSupabaseGateway(
  env: GatewayEnv,
  fetchImpl: typeof fetch = fetch
): SupabasePort {
  // Gateway strictly uses the scoped anon key; service_role never enters the gateway runtime.
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const hasAdminEdge = Boolean(env.GATEWAY_ADMIN_URL && env.GATEWAY_EDGE_SECRET);

  return {
    async verifyApiKey(keyHash) {
      const { data, error } = await client.rpc('verify_api_key', { p_key_hash: keyHash });
      if (error) {
        throw new Error(error.message);
      }
      const payload: unknown = data;
      const rows = z.array(VerifyRowSchema).parse(Array.isArray(payload) ? payload : []);
      const row = rows[0];
      if (!row) {
        return null;
      }
      return {
        apiKeyId: row.api_key_id,
        tenantId: row.tenant_id,
        keyName: row.key_name,
        planTier: row.plan_tier,
        monthlyLimit: row.monthly_limit,
      };
    },

    async recordUsageLog(input) {
      if (hasAdminEdge) {
        const raw = await callGatewayAdminEdge(env, fetchImpl, {
          action: 'usage_log',
          tenantId: input.tenantId,
          apiKeyId: input.apiKeyId,
          route: input.route,
          idempotencyKey: input.idempotencyKey ?? crypto.randomUUID(),
        });
        UsageResponseSchema.parse(raw);
        return;
      }

      const { error } = await client.rpc('record_usage_log', {
        p_tenant_id: input.tenantId,
        p_api_key_id: input.apiKeyId,
        p_route: input.route,
      });
      if (error) {
        throw new Error(error.message);
      }
    },

    async revokeApiKeyPersistent(input) {
      if (!hasAdminEdge) {
        console.warn(
          'GATEWAY_ADMIN_URL/GATEWAY_EDGE_SECRET not configured; revocation applied to Redis cache only'
        );
        return {
          persisted: false,
          revokedCount: 0,
          apiKeyIds: input.apiKeyId ? [input.apiKeyId] : [],
          keyHashes: input.keyHash ? [input.keyHash] : [],
        };
      }

      const raw = await callGatewayAdminEdge(env, fetchImpl, {
        action: 'revoke',
        apiKeyId: input.apiKeyId,
        keyHash: input.keyHash,
      });
      const parsed = RevokeResponseSchema.parse(raw);
      return {
        persisted: true,
        revokedCount: parsed.revokedCount,
        apiKeyIds: parsed.apiKeyIds,
        keyHashes: parsed.keyHashes,
      };
    },
  };
}
