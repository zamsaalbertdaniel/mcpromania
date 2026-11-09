import { BnrRateSchema, BnrRatesSchema, type BnrRate, type BnrRates } from '@mcpromania/types';
import { XMLParser } from 'fast-xml-parser';

import type { CircuitBreaker } from '../core/circuit-breaker.js';
import { AppError } from '../core/errors.js';
import type { SwrCache, SwrHit } from '../core/swr-cache.js';

const FRESH_TTL_SEC = 3_600;
const STALE_TTL_SEC = 172_800;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseTagValue: true,
  trimValues: true,
  isArray: (tagName) => tagName === 'Rate',
});

export type BnrServiceDeps = {
  cache: SwrCache;
  circuit: CircuitBreaker;
  fetchImpl: typeof fetch;
  url: string;
  timeoutMs: number;
  now: () => number;
};

export type BnrService = {
  exchangeRates(currency?: string): Promise<SwrHit<BnrRates>>;
};

export function createBnrService(deps: BnrServiceDeps): BnrService {
  return {
    async exchangeRates(currency) {
      const normalized = normalizeCurrency(currency);
      const hit = await deps.cache.getOrLoad({
        key: 'mcpr:swr:bnr:all',
        freshTtlSec: FRESH_TTL_SEC,
        staleTtlSec: STALE_TTL_SEC,
        liveSource: 'bnr_xml',
        circuit: deps.circuit,
        schema: BnrRatesSchema,
        load: () => fetchBnrRates(deps),
      });
      if (!normalized) {
        return hit;
      }
      const rate = hit.data.rates.find((item) => item.currency === normalized);
      if (!rate) {
        throw new AppError(
          404,
          'CURRENCY_NOT_FOUND',
          `Cursul pentru ${normalized} nu este publicat`
        );
      }
      return {
        ...hit,
        data: {
          publishingDate: hit.data.publishingDate,
          rates: [rate],
        },
      };
    },
  };
}

export function parseBnrXml(xml: string): BnrRates {
  let parsed: unknown;
  try {
    parsed = parser.parse(xml);
  } catch {
    throw new AppError(502, 'BAD_UPSTREAM', 'XML BNR invalid');
  }
  const root = asRecord(asRecord(parsed).DataSet);
  const header = asRecord(root.Header);
  const body = asRecord(root.Body);
  const cube = lastCube(body.Cube);
  const publishingDate = text(cube.date) ?? text(cube['@_date']) ?? text(header.PublishingDate);
  const rates = asArray(cube.Rate).flatMap((node) => {
    const rate = readRate(node);
    return rate ? [rate] : [];
  });
  if (!publishingDate || rates.length === 0) {
    throw new AppError(502, 'BAD_UPSTREAM', 'XML BNR invalid');
  }
  return BnrRatesSchema.parse({ publishingDate, rates });
}

async function fetchBnrRates(deps: BnrServiceDeps): Promise<BnrRates> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs);
  try {
    const response = await deps.fetchImpl(deps.url, {
      method: 'GET',
      headers: { Accept: 'application/xml, text/xml' },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`BNR HTTP ${response.status}`);
    }
    return parseBnrXml(await response.text());
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('BNR timeout');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeCurrency(currency: string | undefined): string | undefined {
  if (currency === undefined || currency.trim().length === 0) {
    return undefined;
  }
  const normalized = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new AppError(400, 'INVALID_CURRENCY', 'Moneda trebuie să aibă 3 litere');
  }
  return normalized;
}

function readRate(node: unknown): BnrRate | null {
  const record = asRecord(node);
  const currency = text(record['@_currency']);
  if (!currency || !/^[A-Z]{3}$/.test(currency)) {
    return null;
  }
  const multiplierValue = record['@_multiplier'];
  const multiplier = multiplierValue === undefined ? 1 : Number(multiplierValue);
  const raw = Number(record['#text']);
  if (!Number.isFinite(raw) || !Number.isFinite(multiplier) || multiplier <= 0 || raw <= 0) {
    return null;
  }
  return BnrRateSchema.parse({
    currency,
    multiplier,
    rate: raw / multiplier,
  });
}

function lastCube(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) {
    return asRecord(value[value.length - 1]);
  }
  return asRecord(value);
}

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
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
