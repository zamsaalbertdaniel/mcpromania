import { describe, expect, it } from 'vitest';

import { createTestApp } from './helpers/app.js';

describe('GET /openapi.json', () => {
  it('serves the full OpenAPI 3.1 specification without authentication', async () => {
    const app = createTestApp();

    const res = await app.request('/openapi.json');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');

    const body = await res.json();
    expect(body.openapi).toBe('3.1.0');
    expect(body.info.title).toContain('MCP România');

    // Verify all 7 active tool endpoints are present in OpenAPI paths
    expect(body.paths['/api/v1/insolvency/check/{cui}']).toBeDefined();
    expect(body.paths['/api/v1/anaf/cui/{cui}']).toBeDefined();
    expect(body.paths['/api/v1/just/cases']).toBeDefined();
    expect(body.paths['/api/v1/bnr/exchange-rate']).toBeDefined();
    expect(body.paths['/api/v1/iban/validate/{iban}']).toBeDefined();
    expect(body.paths['/api/v1/onrc/validate/{regNumber}']).toBeDefined();
    expect(body.paths['/api/v1/onrc/company/{cui}']).toBeDefined();
  });
});
