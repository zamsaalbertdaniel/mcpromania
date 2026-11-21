import { beforeEach, describe, expect, it } from 'vitest';

import { CircuitBreaker } from '../src/core/circuit-breaker.js';
import { SwrCache } from '../src/core/swr-cache.js';
import type { AnafService } from '../src/services/anaf.service.js';
import { createInsolvencyService, isInsolvencyCase } from '../src/services/insolvency.service.js';
import type { JustService } from '../src/services/just.service.js';

import { createTestApp } from './helpers/app.js';
import { createSupabaseMock, TEST_API_KEY, VALID_CUI } from './helpers/fixtures.js';
import { MemoryRedis } from './helpers/memory-redis.js';

describe('InsolvencyService - Logic and Classification', () => {
  const clock = { value: 1_000 };
  const redis = new MemoryRedis(() => clock.value);
  const cache = new SwrCache(redis, () => clock.value);
  const circuit = new CircuitBreaker({ now: () => clock.value });

  beforeEach(() => {
    redis.clear();
    clock.value += 1_000_000_000;
  });

  const mockAnafService = {
    lookup: async () => ({
      data: {
        cui: '14399840',
        denumire: 'DANTE INTERNATIONAL SA',
        adresa: 'Bucuresti, Sector 2',
        nrRegCom: 'J40/372/2002',
        stareInregistrare: 'INREGISTRAT',
        scpTva: true,
        statusInactiv: false,
        statusSplitTva: false,
      },
    }),
  } as unknown as AnafService;

  it('correctly classifies a clean company as IN_BONIS with LOW risk', async () => {
    const mockJustService = {
      search: async () => ({
        data: {
          query: 'DANTE INTERNATIONAL SA',
          queryType: 'numeParte',
          totalCases: 2,
          cases: [
            {
              numar: '100/1/2024',
              institutie: 'JudecatoriaSECTORUL1BUCURESTI',
              departament: 'Secţia Civilă',
              categorieCaz: 'Civil',
              stadiuProcesual: 'Fond',
              obiect: 'cerere de valoare redusă',
              parti: [{ nume: 'DANTE INTERNATIONAL SA', calitateParte: 'Pârât' }],
              sedinte: [],
              caiAtac: [],
            },
          ],
        },
      }),
    } as unknown as JustService;

    const insolvency = createInsolvencyService({
      anaf: mockAnafService,
      just: mockJustService,
      cache,
      circuit,
      now: () => clock.value,
    });

    const report = await insolvency.checkInsolvency({ cui: '14399840' });
    expect(report.data.status).toBe('IN_BONIS');
    expect(report.data.hasInsolvencyRisk).toBe(false);
    expect(report.data.riskLevel).toBe('LOW');
    expect(report.data.totalCases).toBe(0);
    expect(report.data.summary).toContain('nu figurează cu dosare de insolvență');
  });

  it('correctly classifies a solvent company as IN_BONIS even when it appears as CREDITOR in third-party bankruptcies', async () => {
    const mockJustService = {
      search: async () => ({
        data: {
          query: 'DANTE INTERNATIONAL SA',
          queryType: 'numeParte',
          totalCases: 2,
          cases: [
            {
              numar: '340/1285/2026',
              institutie: 'TribunalulComercialCLUJ',
              departament: 'Falimente',
              categorieCaz: 'Faliment',
              stadiuProcesual: 'Fond',
              obiect: 'deschiderea procedurii la cererea debitorului',
              parti: [
                { nume: 'FOOD OS TECH SA', calitateParte: 'Debitor' },
                { nume: 'HODOS BUSINESS RECOVERY SPRL', calitateParte: 'Lichidator' },
                { nume: 'DANTE INTERNATIONAL SA', calitateParte: 'Creditor' },
                { nume: 'VODAFONE ROMANIA SA', calitateParte: 'Creditor' },
              ],
              sedinte: [
                {
                  complet: 'F1',
                  data: '2026-05-10',
                  solutie: 'Deschide procedura falimentului',
                  solutieSumar:
                    'Deschide procedura simplificată a falimentului împotriva debitorului FOOD OS TECH SA.',
                },
              ],
              caiAtac: [],
            },
            {
              numar: '19/122/2018/a7',
              institutie: 'TribunalulGIURGIU',
              departament: 'SINDIC',
              categorieCaz: 'Faliment',
              stadiuProcesual: 'Fond',
              obiect: 'procedura insolvenţei – contestaţie',
              parti: [
                { nume: 'GIURGIU SERVICII LOCALE SA', calitateParte: 'Debitor' },
                { nume: 'DANTE INTERNAŢIONAL SA', calitateParte: 'Intimat Creditor' },
              ],
              sedinte: [],
              caiAtac: [],
            },
          ],
        },
      }),
    } as unknown as JustService;

    const insolvency = createInsolvencyService({
      anaf: mockAnafService,
      just: mockJustService,
      cache,
      circuit,
      now: () => clock.value,
    });

    const report = await insolvency.checkInsolvency({ cui: '14399840' });
    expect(report.data.status).toBe('IN_BONIS');
    expect(report.data.hasInsolvencyRisk).toBe(false);
    expect(report.data.riskLevel).toBe('LOW');
    expect(report.data.totalCases).toBe(0);
    expect(report.data.cases).toHaveLength(0);
    expect(report.data.summary).toContain('IN BONIS');
    expect(report.data.summary).toContain('parte creditoare');
  });

  it('detects and classifies an opened insolvency procedure (INSOLVENTA_DESCHISA)', async () => {
    const mockJustService = {
      search: async () => ({
        data: {
          query: 'FIRMA TEST SRL',
          queryType: 'numeParte',
          totalCases: 1,
          cases: [
            {
              numar: '2000/3/2025',
              institutie: 'TribunalulBUCURESTI',
              departament: 'Secţia a VII-a Civilă',
              categorieCaz: 'Faliment',
              stadiuProcesual: 'Fond',
              obiect:
                'procedura insolvenţei – cererea debitorului conform art. 66 din Legea 85/2014',
              parti: [
                { nume: 'FIRMA TEST SRL', calitateParte: 'Debitor' },
                { nume: 'BANCA TRANSILVANIA', calitateParte: 'Creditor' },
                { nume: 'CONSULT EXPERT SPRL', calitateParte: 'Administrator judiciar provizoriu' },
              ],
              sedinte: [
                {
                  complet: 'C1',
                  data: '2025-10-15',
                  solutie: 'Admite cererea debitorului',
                  solutieSumar: 'Deschide procedura generală de insolvenţă împotriva debitorului.',
                },
              ],
              caiAtac: [],
            },
          ],
        },
      }),
    } as unknown as JustService;

    const insolvency = createInsolvencyService({
      anaf: mockAnafService,
      just: mockJustService,
      cache,
      circuit,
      now: () => clock.value,
    });

    const report = await insolvency.checkInsolvency({ name: 'FIRMA TEST SRL' });
    expect(report.data.status).toBe('INSOLVENTA_DESCHISA');
    expect(report.data.hasInsolvencyRisk).toBe(true);
    expect(report.data.riskLevel).toBe('CRITICAL');
    expect(report.data.totalCases).toBe(1);
    expect(report.data.cases[0]!.judicialAdministrator).toBe('CONSULT EXPERT SPRL');
    expect(report.data.cases[0]!.court).toBe('TribunalulBUCURESTI');
  });

  it('detects bankruptcy (FALIMENT)', async () => {
    const mockJustService = {
      search: async () => ({
        data: {
          query: 'DEBITOR FALIMENT SRL',
          queryType: 'numeParte',
          totalCases: 1,
          cases: [
            {
              numar: '3500/2/2024',
              institutie: 'TribunalulSpecializatCLUJ',
              departament: 'Falimente',
              categorieCaz: 'Faliment',
              stadiuProcesual: 'Fond',
              obiect: 'procedura simplificată a falimentului',
              parti: [
                { nume: 'DEBITOR FALIMENT SRL', calitateParte: 'Debitor' },
                { nume: 'LICHIDARI JUDICIARE IPURL', calitateParte: 'Lichidator judiciar' },
              ],
              sedinte: [
                {
                  complet: 'F2',
                  data: '2024-11-20',
                  solutie: 'Dispune intrarea în faliment',
                  solutieSumar:
                    'Dispune intrarea în faliment prin procedura simplificată. Dizolvă societatea.',
                },
              ],
              caiAtac: [],
            },
          ],
        },
      }),
    } as unknown as JustService;

    const insolvency = createInsolvencyService({
      anaf: mockAnafService,
      just: mockJustService,
      cache,
      circuit,
      now: () => clock.value,
    });

    const report = await insolvency.checkInsolvency({ name: 'DEBITOR FALIMENT SRL' });
    expect(report.data.status).toBe('FALIMENT');
    expect(report.data.riskLevel).toBe('CRITICAL');
    expect(report.data.hasInsolvencyRisk).toBe(true);
    expect(report.data.cases[0]!.judicialAdministrator).toBe('LICHIDARI JUDICIARE IPURL');
  });

  it('identifies judicial reorganization (REORGANIZARE_JUDICIARA)', async () => {
    const mockJustService = {
      search: async () => ({
        data: {
          query: 'REORG SRL',
          queryType: 'numeParte',
          totalCases: 1,
          cases: [
            {
              numar: '400/85/2023',
              institutie: 'TribunalulTIMIS',
              departament: 'Secţia a II-a Civilă',
              categorieCaz: 'Faliment',
              stadiuProcesual: 'Fond',
              obiect: 'procedura insolvenţei – confirmare plan de reorganizare',
              parti: [
                { nume: 'REORG SRL', calitateParte: 'Debitor' },
                { nume: 'ADM SPRL', calitateParte: 'Administrator judiciar' },
              ],
              sedinte: [
                {
                  data: '2023-05-10',
                  solutie: 'Confirmă planul de reorganizare',
                  solutieSumar:
                    'Confirmă planul de reorganizare a activităţii debitorului propus de creditor.',
                },
              ],
              caiAtac: [],
            },
          ],
        },
      }),
    } as unknown as JustService;

    const insolvency = createInsolvencyService({
      anaf: mockAnafService,
      just: mockJustService,
      cache,
      circuit,
      now: () => clock.value,
    });

    const report = await insolvency.checkInsolvency({ name: 'REORG SRL' });
    expect(report.data.status).toBe('REORGANIZARE_JUDICIARA');
    expect(report.data.riskLevel).toBe('HIGH');
  });

  it('rejects invalid CUI with 400', async () => {
    const insolvency = createInsolvencyService({
      anaf: mockAnafService,
      just: {} as JustService,
      cache,
      circuit,
      now: () => clock.value,
    });

    await expect(insolvency.checkInsolvency({ cui: '123' })).rejects.toThrow(
      'CUI-ul specificat este invalid'
    );
  });

  it('isInsolvencyCase correctly identifies insolvency keywords', () => {
    expect(
      isInsolvencyCase({
        numar: '1/1/2024',
        institutie: 'TribunalulBUCURESTI',
        departament: null,
        categorieCaz: 'Civil',
        stadiuProcesual: 'Fond',
        obiect: 'cererea debitorului conform Legii 85/2014',
        parti: [],
        sedinte: [],
        caiAtac: [],
      })
    ).toBe(true);

    expect(
      isInsolvencyCase({
        numar: '2/1/2024',
        institutie: 'Judecatorie',
        departament: null,
        categorieCaz: 'Civil',
        stadiuProcesual: 'Fond',
        obiect: 'divorţ',
        parti: [],
        sedinte: [],
        caiAtac: [],
      })
    ).toBe(false);
  });
});

describe('REST /api/v1/insolvency', () => {
  it('returns 401 when unauthorized', async () => {
    const app = createTestApp();
    const res = await app.request('/api/v1/insolvency/check/14399840');
    expect(res.status).toBe(401);
  });

  it('performs insolvency check via GET /api/v1/insolvency/check/:cui', async () => {
    const app = createTestApp({
      supabase: createSupabaseMock().port,
      fetchImpl: async (url) => {
        const u = String(url);
        if (u.includes('just.ro')) {
          return new Response(
            `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><CautareDosareResponse xmlns="portalquery.just.ro"><CautareDosareResult /></CautareDosareResponse></soap:Body></soap:Envelope>`,
            { status: 200, headers: { 'content-type': 'text/xml' } }
          );
        }
        return new Response(
          JSON.stringify({
            found: [
              {
                date_generale: {
                  cui: 14399840,
                  denumire: 'DANTE INTERNATIONAL SA',
                  adresa: 'Bucuresti',
                  nrRegCom: 'J40/372/2002',
                  stare_inregistrare: 'INREGISTRAT',
                },
                inregistrare_scop_Tva: { scpTVA: true },
                inregistrare_RTVAI: { statusTvaIncasare: false },
                stare_inactiv: { statusInactivi: false },
                inregistrare_SplitTVA: { statusSplitTVA: false },
              },
            ],
            notFound: [],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      },
    });

    const res = await app.request(`/api/v1/insolvency/check/${VALID_CUI}`, {
      headers: { authorization: `Bearer ${TEST_API_KEY}` },
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      data: { status: string; hasInsolvencyRisk: boolean; riskLevel: string };
      meta: { source: string };
    };
    expect(json.ok).toBe(true);
    expect(json.data.status).toBe('IN_BONIS');
    expect(json.data.hasInsolvencyRisk).toBe(false);
    expect(json.data.riskLevel).toBe('LOW');
    expect(json.meta.source).toBe('portal_just_insolvency');
  });
});
