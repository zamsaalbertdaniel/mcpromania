import { describe, expect, it } from 'vitest';

import { EnvSchema } from '../src/config/env.js';
import { AppError } from '../src/core/errors.js';
import { parseBnrXml } from '../src/services/bnr.service.js';

const REAL_FEED_XML = `<?xml version="1.0" encoding="utf-8"?>
<DataSet xmlns="https://www.bnr.ro/xsd" xmlns:xsi="https://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="https://curs.bnr.ro/xsd/nbrfxrates.xsd">
  <Header>
    <Publisher>National Bank of Romania</Publisher>
    <PublishingDate>2026-11-08</PublishingDate>
    <MessageType>DR</MessageType>
  </Header>
  <Body>
    <Subject>Reference rates</Subject>
    <OrigCurrency>RON</OrigCurrency>
    <Cube date="2026-11-09">
      <Rate currency="EUR">4.9720</Rate>
      <Rate currency="USD">4.3125</Rate>
      <Rate currency="GBP">5.6450</Rate>
      <Rate currency="HUF" multiplier="100">1.2850</Rate>
      <Rate currency="JPY" multiplier="100">2.8900</Rate>
      <Rate currency="KRW" multiplier="100">0.3250</Rate>
      <Rate currency="CHF">5.4210</Rate>
    </Cube>
  </Body>
</DataSet>`;

describe('BNR XML parser', () => {
  it('reads the official feed URL', () => {
    const env = EnvSchema.parse({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'anon-test-key',
    });
    expect(env.BNR_XML_URL).toBe('https://curs.bnr.ro/nbrfxrates.xml');
  });

  it('parses a namespaced BNR feed and normalizes multipliers', () => {
    const rates = parseBnrXml(REAL_FEED_XML);
    expect(rates.publishingDate).toBe('2026-11-09');
    expect(rates.rates).toEqual([
      { currency: 'EUR', rate: 4.972, multiplier: 1 },
      { currency: 'USD', rate: 4.3125, multiplier: 1 },
      { currency: 'GBP', rate: 5.645, multiplier: 1 },
      { currency: 'HUF', rate: 0.01285, multiplier: 100 },
      { currency: 'JPY', rate: 0.0289, multiplier: 100 },
      { currency: 'KRW', rate: 0.00325, multiplier: 100 },
      { currency: 'CHF', rate: 5.421, multiplier: 1 },
    ]);
  });

  it('rejects a document that is not the BNR rate feed', () => {
    expect(() => parseBnrXml('<html><body>BNR</body></html>')).toThrow(AppError);
    try {
      parseBnrXml('<html><body>BNR</body></html>');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('BAD_UPSTREAM');
      expect((error as AppError).message).toBe('XML BNR invalid');
    }
  });
});
