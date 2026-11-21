import type { Hono } from 'hono';

import type { AppEnv } from '../../app-env.js';
import { buildInsolvencySuccess } from '../../core/api-response.js';
import { AppError } from '../../core/errors.js';
import type { SupabasePort } from '../../core/supabase.js';
import { recordUsage } from '../../core/usage.js';
import type { InsolvencyService } from '../../services/insolvency.service.js';

export function registerInsolvencyRoute(
  app: Hono<AppEnv>,
  deps: { insolvency: InsolvencyService; supabase: SupabasePort; now: () => number }
): void {
  // 1. Verificare insolvență direct după CUI
  app.get('/api/v1/insolvency/check/:cui', async (c) => {
    const auth = c.get('auth');
    if (!auth) {
      throw new AppError(401, 'UNAUTHORIZED', 'Cheie API lipsă');
    }
    const cui = c.req.param('cui');
    recordUsage(deps.supabase, auth, '/api/v1/insolvency/check/:cui');
    const hit = await deps.insolvency.checkInsolvency({ cui });
    return c.json(
      buildInsolvencySuccess(hit, {
        requestId: c.get('requestId'),
        startedAt: c.get('startedAt'),
        now: deps.now(),
      })
    );
  });

  // 2. Căutare flexibilă după CUI sau nume companie
  app.get('/api/v1/insolvency/search', async (c) => {
    const auth = c.get('auth');
    if (!auth) {
      throw new AppError(401, 'UNAUTHORIZED', 'Cheie API lipsă');
    }
    const cui = c.req.query('cui');
    const name = c.req.query('name') || c.req.query('q');

    if (!cui && !name) {
      throw new AppError(400, 'BAD_REQUEST', 'Parametrul "cui" sau "name" este obligatoriu');
    }

    recordUsage(deps.supabase, auth, '/api/v1/insolvency/search');
    const hit = await deps.insolvency.checkInsolvency({ cui, name });
    return c.json(
      buildInsolvencySuccess(hit, {
        requestId: c.get('requestId'),
        startedAt: c.get('startedAt'),
        now: deps.now(),
      })
    );
  });
}
