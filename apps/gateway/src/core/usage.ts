import type { SupabasePort } from './supabase.js';
import type { AuthContext } from './types.js';

export function recordUsage(supabase: SupabasePort, auth: AuthContext, route: string): void {
  void supabase
    .recordUsageLog({
      tenantId: auth.tenantId,
      apiKeyId: auth.apiKeyId,
      route,
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'unknown error';
      console.error(`usage log failed: ${message}`);
    });
}
