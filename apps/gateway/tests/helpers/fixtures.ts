import { createHash } from 'node:crypto';

import type { GatewayEnv } from '../../src/config/env.js';
import type { SupabasePort } from '../../src/core/supabase.js';
import type { AuthContext } from '../../src/core/types.js';

export const TEST_API_KEY = 'test-key';

export const TEST_AUTH: AuthContext = {
  apiKeyId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  keyName: 'test',
};

export const VALID_CUI = '14399840';

export const testEnv: GatewayEnv = {
  PORT: 4000,
  REDIS_URL: 'redis://127.0.0.1:6379',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon-test-key',
  ANAF_API_URL: 'https://api.anaf.ro/PlatitorTvaRest/api/v8/ws/tva',
  BNR_XML_URL: 'https://curs.bnr.ro/nbrfxrates.xml',
  RATE_LIMIT_PER_MINUTE: 60,
  AUTH_CACHE_TTL_SECONDS: 300,
  CIRCUIT_FAILURE_THRESHOLD: 5,
  CIRCUIT_COOLDOWN_MS: 30_000,
  REQUEST_TIMEOUT_MS: 3000,
};

export function anafPayload(): unknown {
  return {
    found: [
      {
        date_generale: {
          cui: 14399840,
          denumire: 'TEST SRL',
          adresa: 'Strada Exemplu 1',
          nrRegCom: 'J40/1/2020',
          telefon: '0210000000',
          fax: '',
          codPostal: '010101',
          stare_inregistrare: 'INREGISTRAT',
          data_inregistrare: '2020-01-01',
          cod_CAEN: '6201',
          iban: '',
          statusRO_e_Factura: true,
          organFiscalCompetent: 'ANAF Sector 1',
          forma_de_proprietate: 'PRIVATA',
          forma_organizare: 'PERSOANA JURIDICA',
          forma_juridica: 'SRL',
        },
        inregistrare_scop_Tva: { scpTVA: true },
        inregistrare_RTVAI: { statusTvaIncasare: false },
        stare_inactiv: { statusInactivi: false },
        inregistrare_SplitTVA: { statusSplitTVA: false },
        adresa_sediu_social: {
          sdenumire_Strada: 'Exemplu',
          snumar_Strada: '1',
          sdenumire_Localitate: 'Bucuresti',
          sdenumire_Judet: 'Bucuresti',
          scod_Postal: '010101',
          stara: 'Romania',
          sdetalii_Adresa: 'Etaj 1',
        },
      },
    ],
    notFound: [],
  };
}

export const BNR_XML = `<?xml version="1.0" encoding="utf-8"?>
<DataSet xmlns="https://www.bnr.ro/xsd" xmlns:xsi="https://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="https://curs.bnr.ro/xsd/nbrfxrates.xsd">
  <Header>
    <Publisher>National Bank of Romania</Publisher>
    <PublishingDate>2026-11-09</PublishingDate>
    <MessageType>DR</MessageType>
  </Header>
  <Body>
    <Subject>Reference rates</Subject>
    <OrigCurrency>RON</OrigCurrency>
    <Cube date="2026-11-09">
      <Rate currency="EUR">4.9750</Rate>
      <Rate currency="HUF" multiplier="100">1.2500</Rate>
    </Cube>
  </Body>
</DataSet>`;

export function createSupabaseMock(options?: {
  onRecord?: (input: { tenantId: string; apiKeyId: string; route: string }) => Promise<void> | void;
}): { port: SupabasePort; verifyCalls: number[] } {
  const verifyCalls = [0];
  const goodHash = createHash('sha256').update(TEST_API_KEY).digest('hex');
  return {
    verifyCalls,
    port: {
      async verifyApiKey(keyHash) {
        verifyCalls[0] += 1;
        if (keyHash !== goodHash) {
          return null;
        }
        return TEST_AUTH;
      },
      async recordUsageLog(input) {
        await options?.onRecord?.(input);
      },
    },
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export function textResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'application/xml' },
  });
}
