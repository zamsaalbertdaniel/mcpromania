import type { Hono } from 'hono';

import type { AppEnv } from '../../app-env.js';
import { buildBnrSuccess } from '../../core/api-response.js';
import { AppError } from '../../core/errors.js';
import type { SupabasePort } from '../../core/supabase.js';
import { recordUsage } from '../../core/usage.js';
import type { BnrService } from '../../services/bnr.service.js';

export function registerBnrRoute(
  app: Hono<AppEnv>,
  deps: { bnr: BnrService; supabase: SupabasePort; now: () => number }
): void {
  app.get('/api/v1/bnr/exchange-rate', async (c) => {
    const auth = c.get('auth');
    if (!auth) {
      throw new AppError(401, 'UNAUTHORIZED', 'Cheie API lipsă');
    }
    recordUsage(deps.supabase, auth, '/api/v1/bnr/exchange-rate');
    const hit = await deps.bnr.exchangeRates(c.req.query('currency'));
    return c.json(
      buildBnrSuccess(hit, {
        requestId: c.get('requestId'),
        startedAt: c.get('startedAt'),
        now: deps.now(),
      })
    );
  });
}
