import type { Hono } from 'hono';

import type { AppEnv } from '../../app-env.js';
import { buildIbanSuccess } from '../../core/api-response.js';
import { AppError } from '../../core/errors.js';
import type { SupabasePort } from '../../core/supabase.js';
import { recordUsage } from '../../core/usage.js';
import type { IbanService } from '../../services/iban.service.js';

export function registerIbanRoute(
  app: Hono<AppEnv>,
  deps: { iban: IbanService; supabase: SupabasePort; now: () => number }
): void {
  app.get('/api/v1/iban/validate/:iban', async (c) => {
    const auth = c.get('auth');
    if (!auth) {
      throw new AppError(401, 'UNAUTHORIZED', 'Cheie API lipsă');
    }
    recordUsage(deps.supabase, auth, '/api/v1/iban/validate/:iban');
    const result = deps.iban.validate(c.req.param('iban'));
    return c.json(
      buildIbanSuccess(result, {
        requestId: c.get('requestId'),
        startedAt: c.get('startedAt'),
        now: deps.now(),
      })
    );
  });
}
