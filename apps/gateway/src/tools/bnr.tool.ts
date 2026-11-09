import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { buildBnrSuccess, buildError } from '../core/api-response.js';
import { AppError } from '../core/errors.js';
import type { SupabasePort } from '../core/supabase.js';
import type { AuthContext } from '../core/types.js';
import { recordUsage } from '../core/usage.js';
import type { BnrService } from '../services/bnr.service.js';

export function registerBnrTool(
  server: McpServer,
  deps: {
    bnr: BnrService;
    supabase: SupabasePort;
    auth: AuthContext;
    requestId: string;
    startedAt: number;
    now: () => number;
  }
): void {
  server.registerTool(
    'bnr_exchange_rate',
    {
      description:
        'Cursul valutar oficial BNR, normalizat pentru 1 unitate. Parametrul currency este opțional.',
      inputSchema: {
        currency: z
          .string()
          .describe('Cod ISO 4217, de exemplu EUR. Omite parametrul pentru toate cursurile.')
          .optional(),
      },
    },
    async ({ currency }) => {
      recordUsage(deps.supabase, deps.auth, 'mcp:bnr_exchange_rate');
      try {
        const hit = await deps.bnr.exchangeRates(currency);
        const body = buildBnrSuccess(hit, {
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
