import type { Hono } from 'hono';

import type { AppEnv } from '../app-env.js';

export function registerOpenApiRoute(app: Hono<AppEnv>): void {
  const openApiSpec = {
    openapi: '3.1.0',
    info: {
      title: 'MCP România – Enterprise Public Data API',
      version: '1.0.0',
      description:
        'Gateway oficial de mare viteză pentru accesul la datele publice și sistemele enterprise din România: ANAF, BPI Insolvență, Portal Just, Curs BNR, Validare IBAN și ONRC Registrul Comerțului.',
      contact: {
        name: 'MCP România Support',
        url: 'https://mcpromania.ro',
        email: 'contact@mcpromania.ro',
      },
    },
    servers: [
      {
        url: 'https://api.mcpromania.ro',
        description: 'Server de producție (Anycast WAF, Redis SWR cache)',
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'API Key',
          description: 'Introduceți cheia API MCP România (ex: Bearer mcpr_live_...)',
        },
      },
    },
    security: [
      {
        BearerAuth: [],
      },
    ],
    paths: {
      '/api/v1/insolvency/check/{cui}': {
        get: {
          operationId: 'insolvency_risk_check',
          summary: 'Verificare Risc Insolvență & Dosare Faliment BPI',
          description:
            'Verifică în timp real dacă o companie din România se află în procedură de faliment, insolvență deschisă, concordat preventiv sau este activă (IN BONIS) conform BPI și instanțelor judecătorești.',
          parameters: [
            {
              name: 'cui',
              in: 'path',
              required: true,
              description: 'Codul Unic de Înregistrare (CUI sau CIF fără prefixul RO)',
              schema: { type: 'string', example: '14399840' },
            },
          ],
          responses: {
            '200': {
              description: 'Raport oficial de risc de insolvență returnat cu succes.',
            },
          },
        },
      },
      '/api/v1/anaf/cui/{cui}': {
        get: {
          operationId: 'anaf_lookup',
          summary: 'Interogare Stare Fiscală, TVA și e-Factura ANAF',
          description:
            'Returnează datele oficiale de la Ministerul Finanțelor / ANAF: stare firmă (ACTIV/INACTIV), plătitor de TVA, Split TVA și înscriere în registrul RO e-Factura.',
          parameters: [
            {
              name: 'cui',
              in: 'path',
              required: true,
              description: 'Codul fiscal (CUI) al companiei',
              schema: { type: 'string', example: '14399840' },
            },
          ],
          responses: {
            '200': {
              description: 'Date fiscale ANAF obținute cu succes.',
            },
          },
        },
      },
      '/api/v1/just/cases': {
        get: {
          operationId: 'portal_just_search',
          summary: 'Căutare Dosare și Jurisprudență pe portal.just.ro',
          description:
            'Interoghează dosarele înregistrate în judecătorii, tribunale și curți de apel din România după CUI, denumire parte sau număr dosar.',
          parameters: [
            {
              name: 'query',
              in: 'query',
              required: true,
              description: 'Denumire firmă, CUI sau număr dosar (ex: 1240/3/2026)',
              schema: { type: 'string', example: '14399840' },
            },
            {
              name: 'institutie',
              in: 'query',
              required: false,
              description: 'Filtru opțional după instanță (ex: TribunalulBUCURESTI)',
              schema: { type: 'string', example: 'TribunalulBUCURESTI' },
            },
          ],
          responses: {
            '200': {
              description: 'Lista dosarelor găsite în sistemul ECRIS Justiție.',
            },
          },
        },
      },
      '/api/v1/bnr/exchange-rate': {
        get: {
          operationId: 'bnr_exchange_rate',
          summary: 'Curs Valutar Oficial BNR',
          description:
            'Obține cursurile de schimb oficiale publicate zilnic de Banca Națională a României (BNR) pentru EUR, USD, GBP, CHF etc.',
          parameters: [
            {
              name: 'currency',
              in: 'query',
              required: false,
              description:
                'Simbolul valutei (EUR, USD, GBP, CHF). Dacă lipsește, se returnează EUR.',
              schema: { type: 'string', default: 'EUR', example: 'EUR' },
            },
          ],
          responses: {
            '200': {
              description: 'Cursul valutar oficial BNR.',
            },
          },
        },
      },
      '/api/v1/iban/validate/{iban}': {
        get: {
          operationId: 'iban_validate',
          summary: 'Validare Algoritmică IBAN Românesc (MOD97)',
          description:
            'Validează lungimea (24 caractere), algoritmul ISO 13616 MOD97 și identifică automat banca emitentă și codul BIC/SWIFT.',
          parameters: [
            {
              name: 'iban',
              in: 'path',
              required: true,
              description: 'Codul IBAN românesc (ex: RO49INGB0000999901234567)',
              schema: { type: 'string', example: 'RO49INGB0000999901234567' },
            },
          ],
          responses: {
            '200': {
              description: 'Rezultat validare IBAN cu denumire bancă și BIC.',
            },
          },
        },
      },
      '/api/v1/onrc/validate/{regNumber}': {
        get: {
          operationId: 'onrc_validate_regcom',
          summary: 'Validare Număr Înregistrare ONRC',
          description:
            'Validează sintaxa numărului de înregistrare la Registrul Comerțului (J/F/C, indicativ județ, număr ordine și an).',
          parameters: [
            {
              name: 'regNumber',
              in: 'path',
              required: true,
              description: 'Numărul ONRC (ex: J40/372/2002)',
              schema: { type: 'string', example: 'J40/372/2002' },
            },
          ],
          responses: {
            '200': {
              description: 'Detalii validare Registrul Comerțului.',
            },
          },
        },
      },
      '/api/v1/onrc/company/{cui}': {
        get: {
          operationId: 'onrc_company_lookup',
          summary: 'Identificare Profil Companie ONRC',
          description:
            'Reconciliază datele de identificare: CUI fiscal, număr la Registrul Comerțului și adresă sediu social.',
          parameters: [
            {
              name: 'cui',
              in: 'path',
              required: true,
              description: 'CUI-ul companiei căutate',
              schema: { type: 'string', example: '14399840' },
            },
          ],
          responses: {
            '200': {
              description: 'Profil identificare companie returnat cu succes.',
            },
          },
        },
      },
    },
  };

  app.get('/openapi.json', (c) => {
    return c.json(openApiSpec);
  });
}
