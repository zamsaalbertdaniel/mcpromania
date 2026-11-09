import type { Hono } from 'hono';

import type { AppEnv } from '../../app-env.js';
import { buildAnafSuccess } from '../../core/api-response.js';
import { AppError } from '../../core/errors.js';
import type { SupabasePort } from '../../core/supabase.js';
import { recordUsage } from '../../core/usage.js';
import type { AnafService } from '../../services/anaf.service.js';

export function registerAnafRoute(
  app: Hono<AppEnv>,
  deps: { anaf: AnafService; supabase: SupabasePort; now: () => number }
): void {
  app.get('/api/v1/anaf/cui/:cui', async (c) => {
    const auth = c.get('auth');
    if (!auth) {
      throw new AppError(401, 'UNAUTHORIZED', 'Cheie API lipsă');
    }
    recordUsage(deps.supabase, auth, '/api/v1/anaf/cui/:cui');
    const hit = await deps.anaf.lookup(c.req.param('cui'));
    return c.json(
      buildAnafSuccess(hit, {
        requestId: c.get('requestId'),
        startedAt: c.get('startedAt'),
        now: deps.now(),
      })
    );
  });
}
