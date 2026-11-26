import { randomUUID } from 'node:crypto';

import type { SupabasePort } from './supabase.js';
import type { AuthContext } from './types.js';

const USAGE_RETRY_DELAY_MS = 150;

export function recordUsage(supabase: SupabasePort, auth: AuthContext, route: string): void {
  const idempotencyKey = randomUUID();
  const payload = {
    tenantId: auth.tenantId,
    apiKeyId: auth.apiKeyId,
    route,
    idempotencyKey,
  };

  void writeUsageWithRetry(supabase, payload).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'unknown error';
    console.error(
      `usage log permanently failed (route=${route}, key=${auth.apiKeyId}, idempotencyKey=${idempotencyKey}): ${message}`
    );
  });
}

async function writeUsageWithRetry(
  supabase: SupabasePort,
  payload: { tenantId: string; apiKeyId: string; route: string; idempotencyKey: string }
): Promise<void> {
  try {
    await supabase.recordUsageLog(payload);
  } catch (firstError) {
    const firstMsg = firstError instanceof Error ? firstError.message : 'unknown error';
    console.warn(`usage log attempt 1 failed, retrying (${payload.idempotencyKey}): ${firstMsg}`);
    await new Promise((resolve) => setTimeout(resolve, USAGE_RETRY_DELAY_MS));
    await supabase.recordUsageLog(payload);
  }
}
