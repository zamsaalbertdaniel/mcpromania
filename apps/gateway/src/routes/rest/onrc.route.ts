import type { Hono } from 'hono';

import type { AppEnv } from '../../app-env.js';
import { buildOnrcCompanySuccess, buildOnrcValidationSuccess } from '../../core/api-response.js';
import { AppError } from '../../core/errors.js';
import type { SupabasePort } from '../../core/supabase.js';
import { recordUsage } from '../../core/usage.js';
import type { OnrcService } from '../../services/onrc.service.js';

export function registerOnrcRoute(
  app: Hono<AppEnv>,
  deps: { onrc: OnrcService; supabase: SupabasePort; now: () => number }
): void {
  app.get('/api/v1/onrc/validate/:regNumber', async (c) => {
    const auth = c.get('auth');
    if (!auth) {
      throw new AppError(401, 'UNAUTHORIZED', 'Cheie API lipsă');
    }
    const rawParam = decodeURIComponent(c.req.param('regNumber'));
    recordUsage(deps.supabase, auth, '/api/v1/onrc/validate/:regNumber');
    const result = deps.onrc.validateRegCom(rawParam);
    return c.json(
      buildOnrcValidationSuccess(result, {
        requestId: c.get('requestId'),
        startedAt: c.get('startedAt'),
        now: deps.now(),
      })
    );
  });

  app.get('/api/v1/onrc/company/:cui', async (c) => {
    const auth = c.get('auth');
    if (!auth) {
      throw new AppError(401, 'UNAUTHORIZED', 'Cheie API lipsă');
    }
    const cui = c.req.param('cui');
    recordUsage(deps.supabase, auth, '/api/v1/onrc/company/:cui');
    const profile = await deps.onrc.lookupCompany(cui);
    return c.json(
      buildOnrcCompanySuccess(profile, {
        requestId: c.get('requestId'),
        startedAt: c.get('startedAt'),
        now: deps.now(),
      })
    );
  });
}
