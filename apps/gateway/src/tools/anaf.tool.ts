import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { buildAnafSuccess, buildError } from '../core/api-response.js';
import { AppError } from '../core/errors.js';
import type { SupabasePort } from '../core/supabase.js';
import type { AuthContext } from '../core/types.js';
import { recordUsage } from '../core/usage.js';
import type { AnafService } from '../services/anaf.service.js';

export function registerAnafTool(
  server: McpServer,
  deps: {
    anaf: AnafService;
    supabase: SupabasePort;
    auth: AuthContext;
    requestId: string;
    startedAt: number;
    now: () => number;
  }
): void {
  server.registerTool(
    'anaf_lookup',
    {
      description: 'Date fiscale pentru o firmă românească, din API-ul ANAF v8, după CUI.',
      inputSchema: {
        cui: z.string().describe('CUI, cu sau fără prefixul RO'),
      },
    },
    async ({ cui }) => {
      recordUsage(deps.supabase, deps.auth, 'mcp:anaf_lookup');
      try {
        const hit = await deps.anaf.lookup(cui);
        const body = buildAnafSuccess(hit, {
          requestId: deps.requestId,
          startedAt: deps.startedAt,
          now: deps.now(),
        });
        return { content: [{ type: 'text', text: JSON.stringify(body) }] };
      } catch (error) {
        const appError =
          error instanceof AppError
            ? error
            : new AppError(503, 'UPSTREAM_UNAVAILABLE', 'Serviciul este temporar indisponibil');
        const body = buildError({
          code: appError.code,
          message: appError.message,
          requestId: deps.requestId,
          startedAt: deps.startedAt,
          now: deps.now(),
          circuitStatus: appError.code === 'CIRCUIT_OPEN' ? 'OPEN' : null,
        });
        return {
          isError: true,
          content: [{ type: 'text', text: JSON.stringify(body) }],
        };
      }
    }
  );
}
