import { describe, expect, it } from 'vitest';

import { CircuitBreaker } from '../src/core/circuit-breaker.js';
import { SwrCache } from '../src/core/swr-cache.js';
import { createJustService, parseJustXml } from '../src/services/just.service.js';

import { createTestApp } from './helpers/app.js';
import { createSupabaseMock, TEST_API_KEY, textResponse } from './helpers/fixtures.js';
import { MemoryRedis } from './helpers/memory-redis.js';

const MOCK_JUST_XML = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soap:Body>
    <CautareDosareResponse xmlns="portalquery.just.ro">
      <CautareDosareResult>
        <Dosar>
          <numar>1234/2/2024</numar>
          <numarVechi>V123</numarVechi>
          <data>2024-03-15T09:00:00</data>
          <institutie>CurteadeApelBUCURESTI</institutie>
          <departament>Secţia a VII-a</departament>
          <categorieCazNume>Litigii de munca</categorieCazNume>
          <stadiuProcesualNume>Fond</stadiuProcesualNume>
          <obiect>anulare act administrativ</obiect>
          <dataModificare>2024-04-01T12:00:00</dataModificare>
          <parti>
            <DosarParte>
              <nume>POPESCU ION</nume>
              <calitateParte>Reclamant</calitateParte>
            </DosarParte>
            <DosarParte>
              <nume>COMPANIA NATIONALA SA</nume>
              <calitateParte>Parat</calitateParte>
            </DosarParte>
          </parti>
          <sedinte>
            <DosarSedinta>
              <complet>Completul 3 Fond</complet>
              <data>2024-05-10T10:00:00</data>
              <ora>10:00</ora>
              <solutie>Admite cererea</solutie>
              <solutieSumar>Admite in parte actiunea. Cu recurs.</solutieSumar>
              <dataPronuntare>2024-05-10T14:00:00</dataPronuntare>
              <documentSedinta>Hotarare</documentSedinta>
              <numarDocument>123/2024</numarDocument>
              <dataDocument>2024-05-10T00:00:00</dataDocument>
            </DosarSedinta>
          </sedinte>
          <caiAtac>
            <DosarCaleAtac>
              <dataDeclarare>2024-05-20T00:00:00</dataDeclarare>
              <parteDeclaratoare>COMPANIA NATIONALA SA</parteDeclaratoare>
              <tipCaleAtac>Recurs</tipCaleAtac>
            </DosarCaleAtac>
          </caiAtac>
        </Dosar>
      </CautareDosareResult>
    </CautareDosareResponse>
  </soap:Body>
</soap:Envelope>`;

const MOCK_EMPTY_XML = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <CautareDosareResponse xmlns="portalquery.just.ro">
      <CautareDosareResult />
    </CautareDosareResponse>
  </soap:Body>
</soap:Envelope>`;

describe('parseJustXml', () => {
  it('correctly parses a SOAP response with case, parties, hearings, and appeals', () => {
    const cases = parseJustXml(MOCK_JUST_XML);
    expect(cases).toHaveLength(1);
    const c = cases[0]!;
    expect(c.numar).toBe('1234/2/2024');
    expect(c.numarVechi).toBe('V123');
    expect(c.institutie).toBe('CurteadeApelBUCURESTI');
    expect(c.departament).toBe('Secţia a VII-a');
    expect(c.categorieCaz).toBe('Litigii de munca');
    expect(c.stadiuProcesual).toBe('Fond');
    expect(c.obiect).toBe('anulare act administrativ');

    expect(c.parti).toHaveLength(2);
    expect(c.parti[0]).toEqual({ nume: 'POPESCU ION', calitateParte: 'Reclamant' });
    expect(c.parti[1]).toEqual({ nume: 'COMPANIA NATIONALA SA', calitateParte: 'Parat' });

    expect(c.sedinte).toHaveLength(1);
    expect(c.sedinte[0]?.complet).toBe('Completul 3 Fond');
    expect(c.sedinte[0]?.solutie).toBe('Admite cererea');
    expect(c.sedinte[0]?.solutieSumar).toBe('Admite in parte actiunea. Cu recurs.');
    expect(c.sedinte[0]?.numarDocument).toBe('123/2024');

    expect(c.caiAtac).toHaveLength(1);
    expect(c.caiAtac[0]?.tipCaleAtac).toBe('Recurs');
    expect(c.caiAtac[0]?.parteDeclaratoare).toBe('COMPANIA NATIONALA SA');
  });

  it('handles empty results without errors', () => {
    const cases = parseJustXml(MOCK_EMPTY_XML);
    expect(cases).toEqual([]);
  });
});

describe('createJustService', () => {
  it('searches by case number and caches result', async () => {
    let capturedBody = '';
    const fetchImpl: typeof fetch = async (_url, init) => {
      capturedBody = String(init?.body || '');
      return textResponse(MOCK_JUST_XML);
    };

    const redis = new MemoryRedis(() => 1000);
    const cache = new SwrCache(redis, () => 1000);
    const circuit = new CircuitBreaker({ threshold: 3, cooldownMs: 30000, now: () => 1000 });

    const service = createJustService({
      cache,
      circuit,
      fetchImpl,
      url: 'http://test-portalquery.just.ro/Query.asmx',
      timeoutMs: 5000,
      now: () => 1000,
    });

    const res = await service.search({ query: '1234/2/2024' });
    expect(capturedBody).toContain('<numarDosar>1234/2/2024</numarDosar>');
    expect(res.source).toBe('portal_just');
    expect(res.data.totalCases).toBe(1);
    expect(res.data.queryType).toBe('numarDosar');
    expect(res.data.cases[0]?.numar).toBe('1234/2/2024');

    // Second call should come from cache
    const cachedRes = await service.search({ query: '1234/2/2024' });
    expect(cachedRes.source).toBe('cache_fresh');
    expect(cachedRes.data.totalCases).toBe(1);
  });

  it('searches by party name and passes institution filter', async () => {
    let capturedBody = '';
    const fetchImpl: typeof fetch = async (_url, init) => {
      capturedBody = String(init?.body || '');
      return textResponse(MOCK_JUST_XML);
    };

    const redis = new MemoryRedis(() => 1000);
    const cache = new SwrCache(redis, () => 1000);
    const circuit = new CircuitBreaker({ threshold: 3, cooldownMs: 30000, now: () => 1000 });

    const service = createJustService({
      cache,
      circuit,
      fetchImpl,
      url: 'http://test-portalquery.just.ro/Query.asmx',
      timeoutMs: 5000,
      now: () => 1000,
    });

    const res = await service.search({
      query: 'Banca Transilvania',
      institutie: 'CurteadeApelBUCURESTI',
    });
    expect(capturedBody).toContain('<numeParte>Banca Transilvania</numeParte>');
    expect(capturedBody).toContain('<institutie>CurteadeApelBUCURESTI</institutie>');
    expect(res.data.queryType).toBe('numeParte');
  });

  it('throws 400 on empty query', async () => {
    const redis = new MemoryRedis(() => 1000);
    const cache = new SwrCache(redis, () => 1000);
    const circuit = new CircuitBreaker({ threshold: 3, cooldownMs: 30000, now: () => 1000 });

    const service = createJustService({
      cache,
      circuit,
      fetchImpl: async () => textResponse(''),
      url: 'http://test.url',
      timeoutMs: 5000,
      now: () => 1000,
    });

    await expect(service.search({ query: '   ' })).rejects.toThrow(
      'Parametrul query este obligatoriu'
    );
  });
});

describe('REST /api/v1/just/cases', () => {
  it('returns 401 when unauthorized', async () => {
    const app = createTestApp();
    const res = await app.request('/api/v1/just/cases?query=1234/2/2024');
    expect(res.status).toBe(401);
  });

  it('returns 400 when query is missing', async () => {
    const app = createTestApp();
    const res = await app.request('/api/v1/just/cases', {
      headers: { authorization: `Bearer ${TEST_API_KEY}` },
    });
    expect(res.status).toBe(400);
  });

  it('returns 200 with case results on successful search', async () => {
    const app = createTestApp({
      supabase: createSupabaseMock().port,
      fetchImpl: async () => textResponse(MOCK_JUST_XML),
    });

    const res = await app.request('/api/v1/just/cases?query=1234/2/2024', {
      headers: { authorization: `Bearer ${TEST_API_KEY}` },
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      data: { totalCases: number; cases: Array<{ numar: string }> };
      meta: { source: string };
    };
    expect(json.ok).toBe(true);
    expect(json.data.totalCases).toBe(1);
    expect(json.data.cases[0]?.numar).toBe('1234/2/2024');
    expect(json.meta.source).toBe('portal_just');
  });
});
