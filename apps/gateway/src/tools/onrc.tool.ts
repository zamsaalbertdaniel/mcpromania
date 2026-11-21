import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
  buildOnrcValidationSuccess,
  buildOnrcCompanySuccess,
  buildError,
} from '../core/api-response.js';
import { AppError } from '../core/errors.js';
import type { SupabasePort } from '../core/supabase.js';
import type { AuthContext } from '../core/types.js';
import { recordUsage } from '../core/usage.js';
import type { OnrcService } from '../services/onrc.service.js';

export function registerOnrcTools(
  server: McpServer,
  deps: {
    onrc: OnrcService;
    supabase: SupabasePort;
    auth: AuthContext;
    requestId: string;
    startedAt: number;
    now: () => number;
  }
): void {
  server.registerTool(
    'onrc_validate_regcom',
    {
      description:
        'Validează și decodează un număr de înregistrare în Registrul Comerțului din România (format J/F/C: J40/1234/2024, F12/500/2022). Identifică forma juridică a entității (SRL, SA, PFA, Cooperație), oficiul teritorial ORCT, județul, regiunea și instanța judecătorească competentă pentru Portal Just.',
      inputSchema: {
        regNumber: z
          .string()
          .describe(
            'Numărul de ordine din Registrul Comerțului (ex: "J40/1234/2024", "F12/456/2021", "J12/4155/1993")'
          ),
      },
    },
    async ({ regNumber }) => {
      recordUsage(deps.supabase, deps.auth, 'mcp:onrc_validate_regcom');
      try {
        const result = deps.onrc.validateRegCom(regNumber);
        const body = buildOnrcValidationSuccess(result, {
          requestId: deps.requestId,
          startedAt: deps.startedAt,
          now: deps.now(),
        });
        return { content: [{ type: 'text', text: JSON.stringify(body) }] };
      } catch (error) {
        const body = buildError({
          code: 'ONRC_VALIDATION_ERROR',
          message: error instanceof Error ? error.message : 'Eroare la validarea numărului ONRC',
          requestId: deps.requestId,
          startedAt: deps.startedAt,
          now: deps.now(),
        });
        return { content: [{ type: 'text', text: JSON.stringify(body) }] };
      }
    }
  );

  server.registerTool(
    'onrc_company_lookup',
    {
      description:
        'Extrage profilul complet de înregistrare al unei firme românești din Registrul Comerțului după CUI (cod fiscal). Returnează numărul de înmatriculare decodat, oficiul ORCT, vechimea firmei, starea de funcționare și adresa sediului social.',
      inputSchema: {
        cui: z.string().describe('Codul Unic de Înregistrare (CUI), cu sau fără prefixul RO'),
      },
    },
    async ({ cui }) => {
      recordUsage(deps.supabase, deps.auth, 'mcp:onrc_company_lookup');
      try {
        const profile = await deps.onrc.lookupCompany(cui);
        const body = buildOnrcCompanySuccess(profile, {
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
