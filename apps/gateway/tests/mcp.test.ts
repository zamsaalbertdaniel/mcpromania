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
      fetchImpl: async () => textResponse(BNR_XML),
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
    expect(tools).toEqual(expect.arrayContaining(['anaf_lookup', 'bnr_exchange_rate']));

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
  });

  it('handles requests to /mcp/ with a trailing slash', async () => {
    const app = createTestApp({
      supabase: createSupabaseMock().port,
      fetchImpl: async () => textResponse(BNR_XML),
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
