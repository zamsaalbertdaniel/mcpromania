import {
  InsolvencyReportSchema,
  isValidRomanianCui,
  normalizeCui,
  type InsolvencyCase,
  type InsolvencyReport,
  type InsolvencyRiskLevel,
  type InsolvencyStatus,
  type JustDosar,
} from '@mcpromania/types';

import type { CircuitBreaker } from '../core/circuit-breaker.js';
import { AppError } from '../core/errors.js';
import type { SwrCache, SwrHit } from '../core/swr-cache.js';

import type { AnafService } from './anaf.service.js';
import type { JustService } from './just.service.js';

export interface InsolvencyService {
  checkInsolvency(query: { cui?: string; name?: string }): Promise<SwrHit<InsolvencyReport>>;
}

export type InsolvencyServiceDeps = {
  anaf: AnafService;
  just: JustService;
  cache: SwrCache;
  circuit: CircuitBreaker;
  now: () => number;
};

const FRESH_TTL_SEC = 86_400; // 24 hours
const STALE_TTL_SEC = 604_800; // 7 days

export function createInsolvencyService(deps: InsolvencyServiceDeps): InsolvencyService {
  return {
    async checkInsolvency(query) {
      let cui: string | null = null;
      let targetName: string | null = null;

      if (query.cui) {
        cui = normalizeCui(query.cui);
        if (!cui || !isValidRomanianCui(cui)) {
          throw new AppError(400, 'BAD_REQUEST', 'CUI-ul specificat este invalid');
        }
      } else if (query.name && query.name.trim().length >= 3) {
        targetName = query.name.trim();
      } else {
        throw new AppError(
          400,
          'BAD_REQUEST',
          'Trebuie specificat un CUI valid sau o denumire de firmă (minim 3 caractere)'
        );
      }

      const cacheKey = cui
        ? `mcpr:swr:insolvency:cui:${cui}`
        : `mcpr:swr:insolvency:name:${targetName!.toLowerCase()}`;

      return deps.cache.getOrLoad({
        key: cacheKey,
        schema: InsolvencyReportSchema,
        circuit: deps.circuit,
        freshTtlSec: FRESH_TTL_SEC,
        staleTtlSec: STALE_TTL_SEC,
        liveSource: 'portal_just_insolvency',
        load: async () => {
          let companyName = targetName ?? '';

          if (cui) {
            try {
              const anafHit = await deps.anaf.lookup(cui);
              companyName = anafHit.data.denumire;
            } catch {
              companyName = `CUI ${cui}`;
            }
          }

          const justHit = await deps.just.search({ query: companyName });
          const allCases = justHit.data.cases;

          const insolvencyCases = filterAndClassifyInsolvencyCases(allCases);

          return buildInsolvencyReport(cui, companyName, insolvencyCases);
        },
      });
    },
  };
}

const INSOLVENCY_KEYWORDS = [
  'insolven',
  'faliment',
  'reorganizare',
  'concordat',
  '85/2014',
  '85/2006',
  'art.66',
  'art. 66',
  'art.70',
  'art. 70',
  'cererea debitorului',
  'cererea creditorului',
  'procedura simplificată',
  'procedura simplificata',
];

export function isInsolvencyCase(dosar: JustDosar): boolean {
  const cat = (dosar.categorieCaz || '').toLowerCase();
  const obj = (dosar.obiect || '').toLowerCase();
  const dep = (dosar.departament || '').toLowerCase();

  if (cat.includes('faliment') || cat.includes('insolven')) {
    return true;
  }

  if (
    dep.includes('faliment') ||
    dep.includes('secţia a vii-a') ||
    dep.includes('sectia a vii-a')
  ) {
    return true;
  }

  return INSOLVENCY_KEYWORDS.some((kw) => obj.includes(kw) || cat.includes(kw));
}

export function filterAndClassifyInsolvencyCases(cases: JustDosar[]): InsolvencyCase[] {
  return cases.filter(isInsolvencyCase).map((c) => {
    const status = determineCaseStatus(c);
    const judicialAdministrator = extractJudicialAdministrator(c);
    const lastHearing = extractLastHearing(c);

    return {
      caseNumber: c.numar,
      court: c.institutie,
      department: c.departament,
      filingDate: c.data,
      status,
      object: c.obiect,
      stage: c.stadiuProcesual,
      judicialAdministrator,
      parties: c.parti.map((p) => ({ name: p.nume, role: p.calitateParte })),
      lastHearing,
    };
  });
}

function determineCaseStatus(c: JustDosar): InsolvencyStatus {
  const allText = [
    c.obiect || '',
    c.stadiuProcesual || '',
    ...c.sedinte.map((s) => `${s.solutie || ''} ${s.solutieSumar || ''}`),
  ]
    .join(' ')
    .toLowerCase();

  if (
    allText.includes('închide procedura') ||
    allText.includes('inchide procedura') ||
    allText.includes('radierea debitor') ||
    allText.includes('constată încheiată') ||
    allText.includes('constata incheiata')
  ) {
    return 'INCHISA';
  }

  if (
    allText.includes('faliment') ||
    allText.includes('lichidare') ||
    allText.includes('intrarea în faliment') ||
    allText.includes('intrarea in faliment') ||
    allText.includes('dizolvarea debitor')
  ) {
    return 'FALIMENT';
  }

  if (
    allText.includes('confirmă planul') ||
    allText.includes('confirma planul') ||
    allText.includes('reorganizare')
  ) {
    return 'REORGANIZARE_JUDICIARA';
  }

  if (
    allText.includes('deschide procedura') ||
    allText.includes('admite cererea debitor') ||
    allText.includes('admite cererea creditor')
  ) {
    return 'INSOLVENTA_DESCHISA';
  }

  return 'CERERE_INREGISTRATA';
}

function extractJudicialAdministrator(c: JustDosar): string | null {
  for (const p of c.parti) {
    const role = p.calitateParte.toLowerCase();
    if (
      role.includes('administrator judiciar') ||
      role.includes('lichidator') ||
      role.includes('practician')
    ) {
      return p.nume;
    }
  }
  return null;
}

function extractLastHearing(c: JustDosar) {
  if (!c.sedinte || c.sedinte.length === 0) {
    return null;
  }

  // Sort descending by date if available
  const sorted = [...c.sedinte].sort((a, b) => {
    const da = a.data ? Date.parse(a.data) : 0;
    const db = b.data ? Date.parse(b.data) : 0;
    return db - da;
  });

  const latest = sorted[0];
  if (!latest) return null;

  return {
    date: latest.data,
    solution: latest.solutie,
    summary: latest.solutieSumar,
  };
}

export function buildInsolvencyReport(
  cui: string | null,
  name: string,
  cases: InsolvencyCase[]
): InsolvencyReport {
  if (cases.length === 0) {
    return {
      cui,
      name,
      status: 'IN_BONIS',
      hasInsolvencyRisk: false,
      riskLevel: 'LOW',
      summary:
        'Compania nu figurează cu dosare de insolvență, faliment sau concordat preventiv în evidențele instanțelor judecătorești.',
      totalCases: 0,
      cases: [],
    };
  }

  // Determine overall status based on highest severity
  const severityRank: Record<InsolvencyStatus, number> = {
    FALIMENT: 5,
    INSOLVENTA_DESCHISA: 4,
    REORGANIZARE_JUDICIARA: 3,
    CERERE_INREGISTRATA: 2,
    INCHISA: 1,
    IN_BONIS: 0,
  };

  const worstCase = cases.reduce((prev, curr) =>
    severityRank[curr.status] >= severityRank[prev.status] ? curr : prev
  );

  const status = worstCase.status;

  let riskLevel: InsolvencyRiskLevel = 'LOW';
  if (status === 'FALIMENT' || status === 'INSOLVENTA_DESCHISA') {
    riskLevel = 'CRITICAL';
  } else if (status === 'REORGANIZARE_JUDICIARA') {
    riskLevel = 'HIGH';
  } else if (status === 'CERERE_INREGISTRATA') {
    riskLevel = 'MEDIUM';
  } else {
    riskLevel = 'LOW';
  }

  let summary = '';
  switch (status) {
    case 'FALIMENT':
      summary = `Atenție: Compania se află în procedură de FALIMENT conform dosarului ${worstCase.caseNumber} la ${worstCase.court}.`;
      break;
    case 'INSOLVENTA_DESCHISA':
      summary = `Atenție: Compania se află în procedură de INSOLVENȚĂ DESCHISĂ conform dosarului ${worstCase.caseNumber} la ${worstCase.court}.`;
      break;
    case 'REORGANIZARE_JUDICIARA':
      summary = `Compania se află în REORGANIZARE JUDICIARĂ conform dosarului ${worstCase.caseNumber}.`;
      break;
    case 'CERERE_INREGISTRATA':
      summary = `Există o cerere de deschidere a procedurii de insolvență în curs de judecată (dosar ${worstCase.caseNumber} la ${worstCase.court}).`;
      break;
    case 'INCHISA':
      summary = `Compania a avut procedură de insolvență în trecut, dar dosarul figurează ca ÎNCHIS (${worstCase.caseNumber}).`;
      break;
    default:
      summary = 'Nu există riscuri de insolvență active.';
  }

  return {
    cui,
    name,
    status,
    hasInsolvencyRisk: riskLevel !== 'LOW',
    riskLevel,
    summary,
    totalCases: cases.length,
    cases,
  };
}
