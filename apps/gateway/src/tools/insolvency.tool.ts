import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { buildInsolvencySuccess, buildError } from '../core/api-response.js';
import { AppError } from '../core/errors.js';
import type { SupabasePort } from '../core/supabase.js';
import type { AuthContext } from '../core/types.js';
import { recordUsage } from '../core/usage.js';
import type { InsolvencyService } from '../services/insolvency.service.js';

export function registerInsolvencyTool(
  server: McpServer,
  deps: {
    insolvency: InsolvencyService;
    supabase: SupabasePort;
    auth: AuthContext;
    requestId: string;
    startedAt: number;
    now: () => number;
  }
): void {
  server.registerTool(
    'insolvency_risk_check',
    {
      description:
        'Verifică riscul de insolvență, faliment și reorganizare judiciară al unei companii din România (Buletinul Procedurilor de Insolvență BPI & evidențele instanțelor judecătorești Portal Just). Raportează statusul (IN_BONIS, CERERE_INREGISTRATA, INSOLVENTA_DESCHISA, REORGANIZARE_JUDICIARA, FALIMENT), nivelul de risc, numerele de dosar, administratorul/lichidatorul judiciar și soluțiile pronunțate.',
      inputSchema: {
        cui: z
          .string()
          .optional()
          .describe('Codul Unic de Înregistrare al companiei (ex: "14399840" sau "RO14399840")'),
        name: z
          .string()
          .optional()
          .describe(
            'Denumirea societății comerciale (ex: "DANTE INTERNATIONAL SA" sau "BANCA TRANSILVANIA")'
          ),
      },
    },
    async ({ cui, name }) => {
      recordUsage(deps.supabase, deps.auth, 'mcp:insolvency_risk_check');
      try {
        const hit = await deps.insolvency.checkInsolvency({ cui, name });
        const body = buildInsolvencySuccess(hit, {
          requestId: deps.requestId,
          startedAt: deps.startedAt,
          now: deps.now(),
        });
        return { content: [{ type: 'text', text: JSON.stringify(body) }] };
      } catch (error) {
        const status = error instanceof AppError ? error.status : 500;
        const code = error instanceof AppError ? error.code : 'INSOLVENCY_CHECK_FAILED';
        const message =
          error instanceof Error ? error.message : 'Eroare la verificarea riscului de insolvență';
        const body = buildError({
          code,
          message,
          requestId: deps.requestId,
          startedAt: deps.startedAt,
          now: deps.now(),
          circuitStatus: code === 'CIRCUIT_OPEN' ? 'OPEN' : null,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(body) }],
          isError: status >= 400,
        };
      }
    }
  );
}
