import { AnafCompanySchema, RomanianCuiSchema, type AnafCompany } from '@mcpromania/types';

import type { CircuitBreaker } from '../core/circuit-breaker.js';
import { AppError } from '../core/errors.js';
import type { SwrCache, SwrHit } from '../core/swr-cache.js';

const FRESH_TTL_SEC = 86_400;
const STALE_TTL_SEC = 604_800;

export type AnafServiceDeps = {
  cache: SwrCache;
  circuit: CircuitBreaker;
  fetchImpl: typeof fetch;
  url: string;
  timeoutMs: number;
  now: () => number;
};

export type AnafService = {
  lookup(rawCui: string): Promise<SwrHit<AnafCompany>>;
};

export function createAnafService(deps: AnafServiceDeps): AnafService {
  return {
    async lookup(rawCui) {
      const parsed = RomanianCuiSchema.safeParse(rawCui);
      if (!parsed.success) {
        throw new AppError(400, 'INVALID_CUI', 'CUI invalid');
      }
      const cui = parsed.data;
      return deps.cache.getOrLoad({
        key: `mcpr:swr:anaf:${cui}`,
        freshTtlSec: FRESH_TTL_SEC,
        staleTtlSec: STALE_TTL_SEC,
        liveSource: 'anaf_api_v8',
        circuit: deps.circuit,
        schema: AnafCompanySchema,
        load: () => fetchAnafCompany(cui, deps),
      });
    },
  };
}

function formatRomanianDate(timestamp: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Bucharest',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(timestamp));
}

async function fetchAnafCompany(cui: string, deps: AnafServiceDeps): Promise<AnafCompany> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs);
  try {
    const response = await deps.fetchImpl(deps.url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        {
          cui: Number(cui),
          data: formatRomanianDate(deps.now()),
        },
      ]),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`ANAF HTTP ${response.status}`);
    }
    const payload: unknown = await response.json();
    return mapAnafPayload(payload, cui);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    if (isAbortError(error)) {
      throw new Error('ANAF timeout');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function mapAnafPayload(payload: unknown, cui: string): AnafCompany {
  if (!payload || typeof payload !== 'object') {
    throw new AppError(502, 'BAD_UPSTREAM', 'Răspuns ANAF invalid');
  }
  const body = payload as { found?: unknown; notFound?: unknown };
  const notFound = Array.isArray(body.notFound) ? body.notFound.map((item) => String(item)) : [];
  if (notFound.includes(cui) || notFound.includes(String(Number(cui)))) {
    throw new AppError(404, 'COMPANY_NOT_FOUND', 'CUI-ul nu a fost găsit la ANAF');
  }
  const found = Array.isArray(body.found) ? body.found[0] : undefined;
  if (!found || typeof found !== 'object') {
    throw new AppError(404, 'COMPANY_NOT_FOUND', 'CUI-ul nu a fost găsit la ANAF');
  }
  const record = found as Record<string, unknown>;
  const general = asRecord(record.date_generale);
  const tva = asRecord(record.inregistrare_scop_Tva);
  const rtvai = asRecord(record.inregistrare_RTVAI);
  const inactive = asRecord(record.stare_inactiv);
  const split = asRecord(record.inregistrare_SplitTVA);
  const address = asRecord(record.adresa_sediu_social);
  const denumire = text(general.denumire);
  if (!denumire) {
    throw new AppError(502, 'BAD_UPSTREAM', 'Răspuns ANAF invalid');
  }

  return AnafCompanySchema.parse({
    cui,
    denumire,
    adresa: text(general.adresa) ?? '',
    nrRegCom: text(general.nrRegCom),
    telefon: text(general.telefon),
    fax: text(general.fax),
    codPostal: text(general.codPostal),
    stareInregistrare: text(general.stare_inregistrare),
    dataInregistrare: text(general.data_inregistrare),
    codCaen: text(general.cod_CAEN),
    iban: text(general.iban),
    statusRoEFactura: asBoolean(general.statusRO_e_Factura),
    organFiscalCompetent: text(general.organFiscalCompetent),
    formaJuridica: text(general.forma_juridica),
    formaProprietate: text(general.forma_de_proprietate),
    formaOrganizare: text(general.forma_organizare),
    scpTva: asBoolean(tva.scpTVA),
    statusTvaIncasare: asBoolean(rtvai.statusTvaIncasare),
    statusInactiv: asBoolean(inactive.statusInactivi),
    statusSplitTva: asBoolean(split.statusSplitTVA),
    adresaSediuSocial: {
      strada: text(address.sdenumire_Strada),
      numar: text(address.snumar_Strada),
      localitate: text(address.sdenumire_Localitate),
      judet: text(address.sdenumire_Judet),
      codPostal: text(address.scod_Postal),
      tara: text(address.stara),
      detalii: text(address.sdetalii_Adresa),
    },
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return {};
  }
  return value as Record<string, unknown>;
}

function text(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized.length === 0 ? null : normalized;
}

function asBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === 'true';
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}
