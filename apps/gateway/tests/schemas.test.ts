import {
  AnafCompanySchema,
  ApiErrorSchema,
  BnrRatesSchema,
  createApiResponseSchema,
  isValidRomanianCui,
  normalizeCui,
  RomanianCuiSchema,
} from '@mcpromania/types';
import { describe, expect, it } from 'vitest';

const company = {
  cui: '14399840',
  denumire: 'TEST SRL',
  adresa: 'Strada Exemplu 1',
  nrRegCom: 'J40/1/2020',
  telefon: '0210000000',
  fax: null,
  codPostal: '010101',
  stareInregistrare: 'INREGISTRAT',
  dataInregistrare: '2020-01-01',
  codCaen: '6201',
  iban: null,
  statusRoEFactura: true,
  organFiscalCompetent: 'ANAF Sector 1',
  formaJuridica: 'SRL',
  formaProprietate: 'PRIVATA',
  formaOrganizare: 'PERSOANA JURIDICA',
  scpTva: true,
  statusTvaIncasare: false,
  statusInactiv: false,
  statusSplitTva: false,
  adresaSediuSocial: {
    strada: 'Exemplu',
    numar: '1',
    localitate: 'Bucuresti',
    judet: 'Bucuresti',
    codPostal: '010101',
    tara: 'Romania',
    detalii: 'Etaj 1',
  },
};

describe('shared schemas', () => {
  it('normalizes and checks the Romanian CUI control digit', () => {
    expect(normalizeCui(' ro 14399840 ')).toBe('14399840');
    expect(isValidRomanianCui('14399840')).toBe(true);
    expect(isValidRomanianCui('RO14399840')).toBe(true);
    expect(RomanianCuiSchema.parse('RO 14399840')).toBe('14399840');
    expect(isValidRomanianCui('19')).toBe(true);
    expect(isValidRomanianCui('14399841')).toBe(false);
    expect(isValidRomanianCui('RO')).toBe(false);
    expect(isValidRomanianCui('abc')).toBe(false);
    expect(RomanianCuiSchema.safeParse('14399841').success).toBe(false);
  });

  it('accepts an ANAF company, BNR rates and the unified response', () => {
    expect(AnafCompanySchema.parse(company)).toMatchObject({ cui: '14399840', scpTva: true });

    const rates = BnrRatesSchema.parse({
      publishingDate: '2026-11-09',
      rates: [
        { currency: 'EUR', rate: 4.975, multiplier: 1 },
        { currency: 'HUF', rate: 0.0125, multiplier: 100 },
      ],
    });
    expect(rates.rates[1]?.rate).toBe(0.0125);

    const response = createApiResponseSchema(AnafCompanySchema).parse({
      ok: true,
      data: company,
      meta: {
        source: 'anaf_api_v8',
        cached_at: '2026-11-09T00:00:00.000Z',
        stale: false,
        execution_time_ms: 12,
        circuit_status: 'CLOSED',
        request_id: '33333333-3333-4333-8333-333333333333',
      },
    });
    expect(response.meta.source).toBe('anaf_api_v8');

    const error = ApiErrorSchema.parse({
      ok: false,
      error: { code: 'RATE_LIMITED', message: 'Limită de cereri depășită' },
      meta: {
        request_id: '33333333-3333-4333-8333-333333333333',
        execution_time_ms: 1,
        stale: false,
        source: null,
        cached_at: null,
        circuit_status: null,
      },
    });
    expect(error.ok).toBe(false);
  });
});
