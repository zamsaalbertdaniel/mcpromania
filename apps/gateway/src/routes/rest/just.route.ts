import type { Hono } from 'hono';

import type { AppEnv } from '../../app-env.js';
import { buildJustSuccess } from '../../core/api-response.js';
import { AppError } from '../../core/errors.js';
import type { SupabasePort } from '../../core/supabase.js';
import { recordUsage } from '../../core/usage.js';
import type { JustService } from '../../services/just.service.js';

export function registerJustRoute(
  app: Hono<AppEnv>,
  deps: { just: JustService; supabase: SupabasePort; now: () => number }
): void {
  app.get('/api/v1/just/cases', async (c) => {
    const auth = c.get('auth');
    if (!auth) {
      throw new AppError(401, 'UNAUTHORIZED', 'Cheie API lipsă');
    }
    const query = c.req.query('query') || c.req.query('q');
    if (!query || !query.trim()) {
      throw new AppError(400, 'BAD_REQUEST', 'Parametrul query este obligatoriu');
    }
    const institutie = c.req.query('institutie');

    recordUsage(deps.supabase, auth, '/api/v1/just/cases');
    const hit = await deps.just.search({ query: query.trim(), institutie: institutie?.trim() });
    return c.json(
      buildJustSuccess(hit, {
        requestId: c.get('requestId'),
        startedAt: c.get('startedAt'),
        now: deps.now(),
      })
    );
  });
}
