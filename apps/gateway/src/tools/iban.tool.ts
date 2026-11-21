import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { buildIbanSuccess, buildError } from '../core/api-response.js';
import type { SupabasePort } from '../core/supabase.js';
import type { AuthContext } from '../core/types.js';
import { recordUsage } from '../core/usage.js';
import type { IbanService } from '../services/iban.service.js';

export function registerIbanTool(
  server: McpServer,
  deps: {
    iban: IbanService;
    supabase: SupabasePort;
    auth: AuthContext;
    requestId: string;
    startedAt: number;
    now: () => number;
  }
): void {
  server.registerTool(
    'iban_validate',
    {
      description:
        'Validează un cont IBAN conform standardului ISO 13616 (MOD-97) și identifică banca emitentă (pentru IBAN-uri din România: Banca Transilvania, BCR, ING, BRD, Trezoreria Statului, Revolut etc.).',
      inputSchema: {
        iban: z.string().describe('Contul IBAN de verificat (cu sau fără spații)'),
      },
    },
    async ({ iban }) => {
      recordUsage(deps.supabase, deps.auth, 'mcp:iban_validate');
      try {
        const result = deps.iban.validate(iban);
        const body = buildIbanSuccess(result, {
          requestId: deps.requestId,
          startedAt: deps.startedAt,
          now: deps.now(),
        });
        return { content: [{ type: 'text', text: JSON.stringify(body) }] };
      } catch (error) {
        const body = buildError({
          code: 'IBAN_VALIDATION_ERROR',
          message: error instanceof Error ? error.message : 'Eroare la validarea IBAN-ului',
          requestId: deps.requestId,
          startedAt: deps.startedAt,
          now: deps.now(),
        });
        return { content: [{ type: 'text', text: JSON.stringify(body) }] };
      }
    }
  );
}
