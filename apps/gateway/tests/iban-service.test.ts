import { describe, expect, it } from 'vitest';

import { createIbanService, ROMANIAN_BANKS } from '../src/services/iban.service.js';

import { createTestApp } from './helpers/app.js';
import { TEST_API_KEY } from './helpers/fixtures.js';

describe('IbanService', () => {
  const ibanService = createIbanService();

  it('validates a correct Romanian Banca Transilvania IBAN', () => {
    const result = ibanService.validate('RO37BTRL0000000000000001');

    expect(result.isValid).toBe(true);
    expect(result.isRomanian).toBe(true);
    expect(result.countryCode).toBe('RO');
    expect(result.bankCode).toBe('BTRL');
    expect(result.bankName).toBe('Banca Transilvania');
    expect(result.swiftBic).toBe('BTRLRO22');
    expect(result.isTreasury).toBe(false);
    expect(result.formatted).toBe('RO37 BTRL 0000 0000 0000 0001');
    expect(result.validationError).toBeNull();
  });

  it('validates and formats a correct Trezoreria Statului IBAN with lowercase and spaces', () => {
    const result = ibanService.validate('  ro20 trez 0000 0000 0000 0001  ');

    expect(result.isValid).toBe(true);
    expect(result.isRomanian).toBe(true);
    expect(result.bankCode).toBe('TREZ');
    expect(result.bankName).toBe('Trezoreria Statului');
    expect(result.isTreasury).toBe(true);
    expect(result.swiftBic).toBe('TREZROBU');
    expect(result.validationError).toBeNull();
  });

  it('validates a correct Raiffeisen Bank IBAN', () => {
    const result = ibanService.validate('RO90RZBR0000060004529352');

    expect(result.isValid).toBe(true);
    expect(result.bankCode).toBe('RZBR');
    expect(result.bankName).toBe('Raiffeisen Bank România');
    expect(result.validationError).toBeNull();
  });

  it('rejects an IBAN with invalid checksum (MOD-97 failure)', () => {
    // Check digit changed from 37 to 38
    const result = ibanService.validate('RO38BTRL0000000000000001');

    expect(result.isValid).toBe(false);
    expect(result.isRomanian).toBe(true);
    expect(result.bankCode).toBe('BTRL');
    expect(result.validationError).toContain('MOD-97 checksum failed');
  });

  it('rejects an IBAN with invalid length', () => {
    const result = ibanService.validate('RO37BTRL0001');

    expect(result.isValid).toBe(false);
    expect(result.validationError).toContain('Lungime invalidă');
  });

  it('rejects empty input or invalid characters', () => {
    const emptyResult = ibanService.validate('');
    expect(emptyResult.isValid).toBe(false);
    expect(emptyResult.validationError).toContain('gol');

    const invalidCharsResult = ibanService.validate('RO37BTRL000000000000000!');
    expect(invalidCharsResult.isValid).toBe(false);
    expect(invalidCharsResult.validationError).toContain('caractere nepermise');
  });

  it('supports major Romanian banks in dictionary', () => {
    expect(ROMANIAN_BANKS['BTRL']?.name).toBe('Banca Transilvania');
    expect(ROMANIAN_BANKS['BCRB']?.name).toContain('BCR');
    expect(ROMANIAN_BANKS['INGB']?.name).toContain('ING');
    expect(ROMANIAN_BANKS['BRDE']?.name).toContain('BRD');
    expect(ROMANIAN_BANKS['CECE']?.name).toBe('CEC Bank');
    expect(ROMANIAN_BANKS['REVO']?.name).toContain('Revolut');
    expect(ROMANIAN_BANKS['TREZ']?.isTreasury).toBe(true);
  });
});

describe('REST /api/v1/iban/validate', () => {
  it('returns 200 with validation payload for authenticated requests', async () => {
    const app = createTestApp();
    const res = await app.request('/api/v1/iban/validate/RO37BTRL0000000000000001', {
      headers: { authorization: `Bearer ${TEST_API_KEY}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      data: { isValid: boolean; bankName: string };
    };
    expect(body.ok).toBe(true);
    expect(body.data.isValid).toBe(true);
    expect(body.data.bankName).toBe('Banca Transilvania');
  });

  it('requires authentication (401)', async () => {
    const app = createTestApp();
    const res = await app.request('/api/v1/iban/validate/RO37BTRL0000000000000001');

    expect(res.status).toBe(401);
  });
});
