import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { buildJustSuccess, buildError } from '../core/api-response.js';
import { AppError } from '../core/errors.js';
import type { SupabasePort } from '../core/supabase.js';
import type { AuthContext } from '../core/types.js';
import { recordUsage } from '../core/usage.js';
import type { JustService } from '../services/just.service.js';

export function registerJustTool(
  server: McpServer,
  deps: {
    just: JustService;
    supabase: SupabasePort;
    auth: AuthContext;
    requestId: string;
    startedAt: number;
    now: () => number;
  }
): void {
  server.registerTool(
    'portal_just_search',
    {
      description:
        'Caută dosare în instanțele de judecată din România (Portal Just / Ministerul Justiției) după număr dosar sau nume parte/firmă. Returnează detalii complete: stadiu procesual, termene de judecată, soluții pe scurt, căi de atac și părți implicate.',
      inputSchema: {
        query: z
          .string()
          .describe(
            'Numărul dosarului (ex: "1234/2/2024") sau numele unei părți/firme (ex: "Banca Transilvania", "Popescu Ion")'
          ),
        institutie: z
          .string()
          .optional()
          .describe(
            'Codul opțional al instanței (ex: "CurteadeApelBUCURESTI", "TribunalulBUCURESTI", "JudecatoriaSECTORUL1BUCURESTI")'
          ),
      },
    },
    async ({ query, institutie }) => {
      recordUsage(deps.supabase, deps.auth, 'mcp:portal_just_search');
      try {
        const hit = await deps.just.search({ query, institutie });
        const body = buildJustSuccess(hit, {
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
