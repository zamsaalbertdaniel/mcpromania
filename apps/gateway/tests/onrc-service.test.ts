import { describe, expect, it } from 'vitest';

import type { AnafService } from '../src/services/anaf.service.js';
import { createOnrcService } from '../src/services/onrc.service.js';

import { createTestApp } from './helpers/app.js';
import { createSupabaseMock, TEST_API_KEY } from './helpers/fixtures.js';

describe('OnrcService - validateRegCom', () => {
  const dummyAnafService = {} as unknown as AnafService;
  const onrc = createOnrcService({ anaf: dummyAnafService });

  it('validates and decodes a Bucharest company (J40)', () => {
    const res = onrc.validateRegCom('J40/1234/2024');
    expect(res.isValid).toBe(true);
    expect(res.formatted).toBe('J40/1234/2024');
    expect(res.entityType?.code).toBe('J');
    expect(res.entityType?.category).toBe('juridica');
    expect(res.county?.code).toBe('40');
    expect(res.county?.name).toBe('București');
    expect(res.county?.region).toBe('București-Ilfov');
    expect(res.county?.competentCourt).toBe('Tribunalul București');
    expect(res.county?.courtCodeJust).toBe('TribunalulBUCURESTI');
    expect(res.serialNumber).toBe(1234);
    expect(res.year).toBe(2024);
    expect(res.validationError).toBeNull();
  });

  it('validates and decodes a Cluj PFA (F12)', () => {
    const res = onrc.validateRegCom('F12/456/2021');
    expect(res.isValid).toBe(true);
    expect(res.formatted).toBe('F12/456/2021');
    expect(res.entityType?.code).toBe('F');
    expect(res.entityType?.category).toBe('fizica');
    expect(res.county?.code).toBe('12');
    expect(res.county?.name).toBe('Cluj');
    expect(res.county?.courtCodeJust).toBe('TribunalulSpecializatCLUJ');
    expect(res.serialNumber).toBe(456);
    expect(res.year).toBe(2021);
  });

  it('validates and decodes a Maramureș Cooperative (C24)', () => {
    const res = onrc.validateRegCom('C24/10/2019');
    expect(res.isValid).toBe(true);
    expect(res.formatted).toBe('C24/10/2019');
    expect(res.entityType?.code).toBe('C');
    expect(res.entityType?.category).toBe('cooperativa');
    expect(res.county?.code).toBe('24');
    expect(res.county?.name).toBe('Maramureș');
    expect(res.serialNumber).toBe(10);
    expect(res.year).toBe(2019);
  });

  it('handles spaces and normalizes single digit county code (J8 -> J08)', () => {
    const res = onrc.validateRegCom('  j 8 / 999 / 2020 ');
    expect(res.isValid).toBe(true);
    expect(res.formatted).toBe('J08/999/2020');
    expect(res.county?.code).toBe('08');
    expect(res.county?.name).toBe('Brașov');
  });

  it('validates and parses ANAF compact EUID format (e.g. Dante International / eMAG: J2002000372404)', () => {
    const res = onrc.validateRegCom('J2002000372404');
    expect(res.isValid).toBe(true);
    expect(res.formatted).toBe('J40/372/2002');
    expect(res.entityType?.code).toBe('J');
    expect(res.county?.code).toBe('40');
    expect(res.county?.name).toBe('București');
    expect(res.serialNumber).toBe(372);
    expect(res.year).toBe(2002);
  });

  it('validates 2-digit year format (e.g. 93 -> 1993, 23 -> 2023)', () => {
    const res93 = onrc.validateRegCom('J12/4155/93');
    expect(res93.isValid).toBe(true);
    expect(res93.formatted).toBe('J12/4155/1993');
    expect(res93.year).toBe(1993);

    const res23 = onrc.validateRegCom('J40/500/23');
    expect(res23.isValid).toBe(true);
    expect(res23.formatted).toBe('J40/500/2023');
    expect(res23.year).toBe(2023);
  });

  it('rejects unknown county codes', () => {
    const res = onrc.validateRegCom('J99/123/2024');
    expect(res.isValid).toBe(false);
    expect(res.validationError).toContain('Cod județean ONRC necunoscut');
  });

  it('rejects invalid entity prefix', () => {
    const res = onrc.validateRegCom('X40/123/2024');
    expect(res.isValid).toBe(false);
    expect(res.validationError).toContain('Format invalid');
  });

  it('rejects years outside valid range (before 1990)', () => {
    const res = onrc.validateRegCom('J40/123/1985');
    expect(res.isValid).toBe(false);
    expect(res.validationError).toContain('în afara intervalului valid');
  });

  it('handles empty input gracefully', () => {
    const res = onrc.validateRegCom('');
    expect(res.isValid).toBe(false);
    expect(res.validationError).toContain('gol');
  });
});

describe('OnrcService - lookupCompany', () => {
  it('fetches company and computes ONRC profile and company age', async () => {
    const mockAnafService = {
      lookup: async () => ({
        data: {
          cui: '14399840',
          denumire: 'BANCA TRANSILVANIA SA',
          adresa: 'Cluj-Napoca, Str. G. Baritiu 8',
          nrRegCom: 'J12/4155/1993',
          telefon: null,
          fax: null,
          codPostal: '400027',
          stareInregistrare: 'INREGISTRAT',
          dataInregistrare: '1993-12-16',
          codCaen: '6419',
          iban: null,
          statusRoEFactura: true,
          organFiscalCompetent: 'DGAMC',
          formaJuridica: 'SA',
          formaProprietate: null,
          formaOrganizare: null,
          scpTva: true,
          statusTvaIncasare: false,
          statusInactiv: false,
          statusSplitTva: false,
          adresaSediuSocial: {
            strada: 'Str. G. Baritiu',
            numar: '8',
            localitate: 'Cluj-Napoca',
            judet: 'Cluj',
            codPostal: '400027',
            tara: 'Romania',
            detalii: null,
          },
        },
      }),
    };

    const onrc = createOnrcService({ anaf: mockAnafService as unknown as AnafService });
    const profile = await onrc.lookupCompany('14399840');

    expect(profile.cui).toBe('14399840');
    expect(profile.name).toBe('BANCA TRANSILVANIA SA');
    expect(profile.onrc.isValid).toBe(true);
    expect(profile.onrc.formatted).toBe('J12/4155/1993');
    expect(profile.onrc.county?.name).toBe('Cluj');
    expect(profile.onrc.county?.courtCodeJust).toBe('TribunalulSpecializatCLUJ');
    expect(profile.status.isActive).toBe(true);
    expect(profile.status.isVatPayer).toBe(true);
    expect(profile.ageYears).toBeGreaterThanOrEqual(30);
  });

  it('correctly parses compact ANAF EUID nrRegCom (e.g. eMAG Dante International)', async () => {
    const mockAnafService = {
      lookup: async () => ({
        data: {
          cui: '14399840',
          denumire: 'DANTE INTERNATIONAL SA',
          adresa: 'Bucuresti, Sector 2, Str. Gara Herastrau 6',
          nrRegCom: 'J2002000372404',
          telefon: null,
          fax: null,
          codPostal: '020334',
          stareInregistrare: 'INREGISTRAT',
          dataInregistrare: '2002-01-23',
          codCaen: '4791',
          iban: null,
          statusRoEFactura: true,
          organFiscalCompetent: 'DGAMC',
          formaJuridica: 'SA',
          formaProprietate: null,
          formaOrganizare: null,
          scpTva: true,
          statusTvaIncasare: false,
          statusInactiv: false,
          statusSplitTva: false,
          adresaSediuSocial: {
            strada: 'Str. Gara Herastrau',
            numar: '6',
            localitate: 'Bucuresti',
            judet: 'Bucuresti',
            codPostal: '020334',
            tara: 'Romania',
            detalii: null,
          },
        },
      }),
    };

    const onrc = createOnrcService({ anaf: mockAnafService as unknown as AnafService });
    const profile = await onrc.lookupCompany('14399840');

    expect(profile.onrc.isValid).toBe(true);
    expect(profile.onrc.formatted).toBe('J40/372/2002');
    expect(profile.onrc.county?.name).toBe('București');
    expect(profile.onrc.county?.courtCodeJust).toBe('TribunalulBUCURESTI');
    expect(profile.onrc.serialNumber).toBe(372);
    expect(profile.onrc.year).toBe(2002);
    expect(profile.ageYears).toBeGreaterThanOrEqual(22);
  });

  it('throws 400 BAD_REQUEST on invalid CUI', async () => {
    const onrc = createOnrcService({ anaf: {} as unknown as AnafService });
    await expect(onrc.lookupCompany('abc')).rejects.toThrow('CUI-ul specificat este invalid');
  });
});

describe('REST /api/v1/onrc', () => {
  it('returns 401 when unauthorized', async () => {
    const app = createTestApp();
    const res = await app.request('/api/v1/onrc/validate/J40%2F1234%2F2024');
    expect(res.status).toBe(401);
  });

  it('validates ONRC registration via GET /api/v1/onrc/validate/:regNumber', async () => {
    const app = createTestApp({
      supabase: createSupabaseMock().port,
    });

    const res = await app.request('/api/v1/onrc/validate/J40%2F1234%2F2024', {
      headers: { authorization: `Bearer ${TEST_API_KEY}` },
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      data: { isValid: boolean; county: { name: string } };
      meta: { source: string };
    };
    expect(json.ok).toBe(true);
    expect(json.data.isValid).toBe(true);
    expect(json.data.county.name).toBe('București');
    expect(json.meta.source).toBe('onrc_validator');
  });
});
