import { describe, expect, it } from 'vitest';

import { createTestApp } from './helpers/app.js';
import { BNR_XML, createSupabaseMock, textResponse, TEST_API_KEY } from './helpers/fixtures.js';

const headers = {
  accept: 'application/json, text/event-stream',
  'content-type': 'application/json',
  authorization: `Bearer ${TEST_API_KEY}`,
};

describe('POST /mcp', () => {
  it('lists both tools and calls the BNR exchange rate tool', async () => {
    const app = createTestApp({
      supabase: createSupabaseMock().port,
      fetchImpl: async (url) => {
        if (String(url).includes('just.ro')) {
          return textResponse(`<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <CautareDosareResponse xmlns="portalquery.just.ro">
      <CautareDosareResult>
        <Dosar>
          <numar>100/1/2024</numar>
          <institutie>CurteadeApelBUCURESTI</institutie>
          <parti><DosarParte><nume>TEST SRL</nume><calitateParte>Reclamant</calitateParte></DosarParte></parti>
          <sedinte />
          <caiAtac />
        </Dosar>
      </CautareDosareResult>
    </CautareDosareResponse>
  </soap:Body>
</soap:Envelope>`);
        }
        return textResponse(BNR_XML);
      },
    });

    const listed = await postMcp(app, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    });
    expect(listed.status).toBe(200);
    const listBody = await readMcp(listed);
    const tools = (listBody.result as { tools: Array<{ name: string }> }).tools.map(
      (tool) => tool.name
    );
    expect(tools).toEqual(
      expect.arrayContaining([
        'anaf_lookup',
        'bnr_exchange_rate',
        'iban_validate',
        'portal_just_search',
        'onrc_validate_regcom',
        'onrc_company_lookup',
        'insolvency_risk_check',
      ])
    );

    const ibanCall = await postMcp(app, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'iban_validate',
        arguments: { iban: 'RO37BTRL0000000000000001' },
      },
    });
    expect(ibanCall.status).toBe(200);
    const ibanBody = await readMcp(ibanCall);
    const ibanText =
      (ibanBody.result as { content: Array<{ text: string }> }).content[0]?.text ?? '';
    const ibanPayload = JSON.parse(ibanText) as {
      ok: boolean;
      data: { isValid: boolean; bankName: string; bankCode: string };
    };
    expect(ibanPayload.ok).toBe(true);
    expect(ibanPayload.data.isValid).toBe(true);
    expect(ibanPayload.data.bankCode).toBe('BTRL');
    expect(ibanPayload.data.bankName).toBe('Banca Transilvania');

    const called = await postMcp(app, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'bnr_exchange_rate',
        arguments: { currency: 'HUF' },
      },
    });
    expect(called.status).toBe(200);
    const callBody = await readMcp(called);
    const text = (callBody.result as { content: Array<{ text: string }> }).content[0]?.text ?? '';
    const payload = JSON.parse(text) as {
      ok: boolean;
      data: {
        publishingDate: string;
        rates: Array<{ currency: string; rate: number; multiplier: number }>;
      };
      meta: { source: string; stale: boolean };
    };
    expect(payload.ok).toBe(true);
    expect(payload.data.publishingDate).toBe('2026-11-09');
    expect(payload.data.rates).toEqual([{ currency: 'HUF', rate: 0.0125, multiplier: 100 }]);
    expect(payload.meta.source).toBe('bnr_xml');
    expect(payload.meta.stale).toBe(false);

    const justCall = await postMcp(app, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'portal_just_search',
        arguments: { query: '100/1/2024' },
      },
    });
    expect(justCall.status).toBe(200);
    const justBody = await readMcp(justCall);
    const justText =
      (justBody.result as { content: Array<{ text: string }> }).content[0]?.text ?? '';
    const justPayload = JSON.parse(justText) as {
      ok: boolean;
      data: { totalCases: number; cases: Array<{ numar: string }> };
      meta: { source: string };
    };
    expect(justPayload.ok).toBe(true);
    expect(justPayload.data.totalCases).toBe(1);
    expect(justPayload.data.cases[0]?.numar).toBe('100/1/2024');
    expect(justPayload.meta.source).toBe('portal_just');

    const onrcCall = await postMcp(app, {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'onrc_validate_regcom',
        arguments: { regNumber: 'J40/1234/2024' },
      },
    });
    expect(onrcCall.status).toBe(200);
    const onrcBody = await readMcp(onrcCall);
    const onrcText =
      (onrcBody.result as { content: Array<{ text: string }> }).content[0]?.text ?? '';
    const onrcPayload = JSON.parse(onrcText) as {
      ok: boolean;
      data: { isValid: boolean; county: { name: string } };
      meta: { source: string };
    };
    expect(onrcPayload.ok).toBe(true);
    expect(onrcPayload.data.isValid).toBe(true);
    expect(onrcPayload.data.county.name).toBe('București');
    expect(onrcPayload.meta.source).toBe('onrc_validator');

    const insolvCall = await postMcp(app, {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'insolvency_risk_check',
        arguments: { name: 'TEST SRL' },
      },
    });
    expect(insolvCall.status).toBe(200);
    const insolvBody = await readMcp(insolvCall);
    const insolvContent = (insolvBody.result as { content: Array<{ type: string; text: string }> })
      .content[0]!.text;
    const insolvPayload = JSON.parse(insolvContent) as {
      ok: boolean;
      data: { status: string; hasInsolvencyRisk: boolean };
    };
    expect(insolvPayload.ok).toBe(true);
    expect(insolvPayload.data.status).toBe('IN_BONIS');
  });

  it('handles requests to /mcp/ with a trailing slash', async () => {
    const app = createTestApp({
      supabase: createSupabaseMock().port,
      fetchImpl: async (url) => {
        if (String(url).includes('just.ro')) {
          return textResponse(`<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <CautareDosareResponse xmlns="portalquery.just.ro">
      <CautareDosareResult>
        <Dosar>
          <numar>100/1/2024</numar>
          <institutie>CurteadeApelBUCURESTI</institutie>
          <parti><DosarParte><nume>TEST SRL</nume><calitateParte>Reclamant</calitateParte></DosarParte></parti>
          <sedinte />
          <caiAtac />
        </Dosar>
      </CautareDosareResult>
    </CautareDosareResponse>
  </soap:Body>
</soap:Envelope>`);
        }
        return textResponse(BNR_XML);
      },
    });

    const response = await app.request('/mcp/', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      }),
    });
    expect(response.status).toBe(200);
    const body = await readMcp(response);
    expect(body.result).toBeDefined();
  });
});

function postMcp(
  app: { request: (input: string, init?: RequestInit) => Response | Promise<Response> },
  body: unknown
): Promise<Response> {
  return Promise.resolve(
    app.request('/mcp', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
  );
}

async function readMcp(response: Response): Promise<{ result?: unknown; error?: unknown }> {
  const text = await response.text();
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('text/event-stream')) {
    const data = text
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .map((line) => line.slice(6))
      .filter((line) => line.length > 0);
    return JSON.parse(data[data.length - 1] ?? '{}') as { result?: unknown };
  }
  return JSON.parse(text) as { result?: unknown };
}
