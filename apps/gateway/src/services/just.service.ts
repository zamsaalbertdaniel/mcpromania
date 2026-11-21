import {
  JustSearchResultSchema,
  type JustCaleAtac,
  type JustDosar,
  type JustParte,
  type JustSearchResult,
  type JustSedinta,
} from '@mcpromania/types';
import { XMLParser } from 'fast-xml-parser';

import type { CircuitBreaker } from '../core/circuit-breaker.js';
import { AppError } from '../core/errors.js';
import type { SwrCache, SwrHit } from '../core/swr-cache.js';

export interface JustService {
  search(params: { query: string; institutie?: string }): Promise<SwrHit<JustSearchResult>>;
}

export type JustServiceDeps = {
  cache: SwrCache;
  circuit: CircuitBreaker;
  fetchImpl?: typeof fetch;
  url: string;
  timeoutMs: number;
  now: () => number;
};

export function createJustService(deps: JustServiceDeps): JustService {
  const fetchFn = deps.fetchImpl ?? fetch;

  return {
    async search({ query, institutie }): Promise<SwrHit<JustSearchResult>> {
      const clean = (query || '').trim();
      if (!clean) {
        throw new AppError(400, 'BAD_REQUEST', 'Parametrul query este obligatoriu');
      }

      const isCaseNumber = clean.includes('/') && /^\d+[\w.-]+$/.test(clean.replace(/\//g, ''));
      const queryType = isCaseNumber ? 'numarDosar' : 'numeParte';
      const cleanInst = institutie?.trim() || '';

      const cacheKey = `mcpr:swr:just:${queryType}:${clean.toLowerCase()}${cleanInst ? ':' + cleanInst.toLowerCase() : ''}`;

      return deps.cache.getOrLoad({
        key: cacheKey,
        schema: JustSearchResultSchema,
        circuit: deps.circuit,
        freshTtlSec: 7200, // 2 hours
        staleTtlSec: 86400, // 24 hours
        liveSource: 'portal_just',
        load: async () => {
          const soapBody = buildSoapEnvelope(clean, queryType, cleanInst || undefined);

          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), deps.timeoutMs);

          let res: Response;
          try {
            res = await fetchFn(deps.url, {
              method: 'POST',
              headers: {
                'Content-Type': 'text/xml; charset=utf-8',
                SOAPAction: '"portalquery.just.ro/CautareDosare"',
                'User-Agent': 'Mozilla/5.0 (compatible; MCPRomania/1.0; +https://mcpromania.ro)',
              },
              body: soapBody,
              signal: controller.signal,
            });
          } catch (error) {
            clearTimeout(timer);
            const isAbort =
              (error instanceof Error && error.name === 'AbortError') || controller.signal.aborted;
            if (isAbort) {
              throw new AppError(
                504,
                'UPSTREAM_TIMEOUT',
                'Portalul Ministerului Justiției nu a răspuns în timp util'
              );
            }
            throw new AppError(
              503,
              'UPSTREAM_UNAVAILABLE',
              'Serviciul Portal Just este temporar indisponibil'
            );
          } finally {
            clearTimeout(timer);
          }

          if (!res.ok) {
            throw new AppError(
              503,
              'UPSTREAM_UNAVAILABLE',
              `Portalul Ministerului Justiției a răspuns cu eroarea HTTP ${res.status}`
            );
          }

          const xmlText = await res.text();
          const cases = parseJustXml(xmlText);

          return {
            query: clean,
            queryType,
            totalCases: cases.length,
            cases,
          };
        },
      });
    },
  };
}

function buildSoapEnvelope(
  query: string,
  queryType: 'numarDosar' | 'numeParte',
  institutie?: string
): string {
  const escapeXml = (str: string) =>
    str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const cleanQuery = escapeXml(query);
  const cleanInst = institutie ? `<institutie>${escapeXml(institutie)}</institutie>` : '';

  if (queryType === 'numarDosar') {
    return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <CautareDosare xmlns="portalquery.just.ro">
      <numarDosar>${cleanQuery}</numarDosar>
      ${cleanInst}
    </CautareDosare>
  </soap:Body>
</soap:Envelope>`;
  }

  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <CautareDosare xmlns="portalquery.just.ro">
      <numeParte>${cleanQuery}</numeParte>
      ${cleanInst}
    </CautareDosare>
  </soap:Body>
</soap:Envelope>`;
}

interface RawParte {
  nume?: string;
  calitateParte?: string;
}

interface RawSedinta {
  complet?: string;
  data?: string;
  ora?: string;
  solutie?: string;
  solutieSumar?: string;
  dataPronuntare?: string;
  documentSedinta?: string;
  numarDocument?: string;
  dataDocument?: string;
}

interface RawCaleAtac {
  dataDeclarare?: string;
  parteDeclaratoare?: string;
  tipCaleAtac?: string;
}

interface RawDosar {
  numar?: string;
  numarVechi?: string;
  data?: string;
  institutie?: string;
  departament?: string;
  categorieCaz?: string;
  categorieCazNume?: string;
  stadiuProcesual?: string;
  stadiuProcesualNume?: string;
  obiect?: string;
  dataModificare?: string;
  parti?: { DosarParte?: RawParte[] | RawParte };
  sedinte?: { DosarSedinta?: RawSedinta[] | RawSedinta };
  caiAtac?: { DosarCaleAtac?: RawCaleAtac[] | RawCaleAtac };
}

export function parseJustXml(xmlText: string): JustDosar[] {
  const parser = new XMLParser({
    ignoreAttributes: true,
    isArray: (name) => ['Dosar', 'DosarParte', 'DosarSedinta', 'DosarCaleAtac'].includes(name),
    trimValues: true,
  });

  const parsed = parser.parse(xmlText) as Record<string, unknown>;
  const envelope =
    (parsed['soap:Envelope'] as Record<string, unknown>) ??
    (parsed.Envelope as Record<string, unknown>);
  const body =
    (envelope?.['soap:Body'] as Record<string, unknown>) ??
    (envelope?.Body as Record<string, unknown>);
  const response = (body?.CautareDosareResponse ?? body?.CautareDosare2Response) as Record<
    string,
    unknown
  >;
  const result = (response?.CautareDosareResult ?? response?.CautareDosare2Result) as Record<
    string,
    unknown
  >;

  if (!result || !result.Dosar) {
    return [];
  }

  const rawList: RawDosar[] = Array.isArray(result.Dosar)
    ? (result.Dosar as RawDosar[])
    : [result.Dosar as RawDosar];

  return rawList.map((raw): JustDosar => {
    // Normalize parties
    const rawParti = raw.parti?.DosarParte;
    const partiList: RawParte[] = Array.isArray(rawParti) ? rawParti : rawParti ? [rawParti] : [];
    const parti: JustParte[] = partiList.map((p) => ({
      nume: String(p.nume || ''),
      calitateParte: String(p.calitateParte || ''),
    }));

    // Normalize hearings
    const rawSedinte = raw.sedinte?.DosarSedinta;
    const sedinteList: RawSedinta[] = Array.isArray(rawSedinte)
      ? rawSedinte
      : rawSedinte
        ? [rawSedinte]
        : [];
    const sedinte: JustSedinta[] = sedinteList.map((s) => ({
      complet: s.complet ? String(s.complet) : null,
      data: s.data ? String(s.data) : null,
      ora: s.ora ? String(s.ora) : null,
      solutie: s.solutie ? String(s.solutie) : null,
      solutieSumar: s.solutieSumar ? String(s.solutieSumar) : null,
      dataPronuntare: s.dataPronuntare ? String(s.dataPronuntare) : null,
      documentSedinta: s.documentSedinta ? String(s.documentSedinta) : null,
      numarDocument: s.numarDocument ? String(s.numarDocument) : null,
      dataDocument: s.dataDocument ? String(s.dataDocument) : null,
    }));

    // Normalize appeals
    const rawCaiAtac = raw.caiAtac?.DosarCaleAtac;
    const caiAtacList: RawCaleAtac[] = Array.isArray(rawCaiAtac)
      ? rawCaiAtac
      : rawCaiAtac
        ? [rawCaiAtac]
        : [];
    const caiAtac: JustCaleAtac[] = caiAtacList.map((c) => ({
      dataDeclarare: c.dataDeclarare ? String(c.dataDeclarare) : null,
      parteDeclaratoare: c.parteDeclaratoare ? String(c.parteDeclaratoare) : null,
      tipCaleAtac: c.tipCaleAtac ? String(c.tipCaleAtac) : null,
    }));

    return {
      numar: String(raw.numar || ''),
      numarVechi: raw.numarVechi ? String(raw.numarVechi) : null,
      data: raw.data ? String(raw.data) : null,
      institutie: String(raw.institutie || ''),
      departament: raw.departament ? String(raw.departament) : null,
      categorieCaz: raw.categorieCazNume
        ? String(raw.categorieCazNume)
        : raw.categorieCaz
          ? String(raw.categorieCaz)
          : null,
      stadiuProcesual: raw.stadiuProcesualNume
        ? String(raw.stadiuProcesualNume)
        : raw.stadiuProcesual
          ? String(raw.stadiuProcesual)
          : null,
      obiect: raw.obiect ? String(raw.obiect) : null,
      dataModificare: raw.dataModificare ? String(raw.dataModificare) : null,
      parti,
      sedinte,
      caiAtac,
    };
  });
}
