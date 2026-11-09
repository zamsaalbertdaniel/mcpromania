import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { GatewayEnv } from '../config/env.js';

import type { AuthContext } from './types.js';

const VerifyRowSchema = z.object({
  api_key_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  key_name: z.string().min(1),
});

export type UsageLogInput = {
  tenantId: string;
  apiKeyId: string;
  route: string;
};

export interface SupabasePort {
  verifyApiKey(keyHash: string): Promise<AuthContext | null>;
  recordUsageLog(input: UsageLogInput): Promise<void>;
}

export function createSupabaseGateway(env: GatewayEnv): SupabasePort {
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

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
      };
    },
    async recordUsageLog(input) {
      const { error } = await client.rpc('record_usage_log', {
        p_tenant_id: input.tenantId,
        p_api_key_id: input.apiKeyId,
        p_route: input.route,
      });
      if (error) {
        throw new Error(error.message);
      }
    },
  };
}
