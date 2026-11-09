import { z } from 'zod';

// Admin Client (service_role) se folosește doar în workers. Gateway-ul folosește întotdeauna client scoped pe tenant_id.

export const TenantSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  createdAt: z.string().datetime(),
});
export type Tenant = z.infer<typeof TenantSchema>;

export const ApiKeySchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string().min(1),
  keyHash: z.string().min(1),
  createdAt: z.string().datetime(),
});
export type ApiKey = z.infer<typeof ApiKeySchema>;

export const UsageLogSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  apiKeyId: z.string().uuid(),
  route: z.string().min(1),
  createdAt: z.string().datetime(),
});
export type UsageLog = z.infer<typeof UsageLogSchema>;

const CUI_WEIGHTS = [7, 5, 3, 2, 1, 7, 5, 3, 2] as const;

export function normalizeCui(input: string): string | null {
  const compact = input.trim().toUpperCase().replace(/\s+/g, '').replace(/^RO/, '');
  if (!/^\d{2,10}$/.test(compact)) {
    return null;
  }
  return compact;
}

export function isValidRomanianCui(input: string): boolean {
  const cui = normalizeCui(input);
  if (!cui) {
    return false;
  }
  const digits = cui.split('').map((char) => Number(char));
  const control = digits[digits.length - 1];
  const body = digits.slice(0, -1);
  if (control === undefined || body.length === 0) {
    return false;
  }
  const weights = CUI_WEIGHTS.slice(CUI_WEIGHTS.length - body.length);
  const sum = body.reduce((total, digit, index) => total + digit * (weights[index] ?? 0), 0);
  let check = (sum * 10) % 11;
  if (check === 10) {
    check = 0;
  }
  return check === control;
}

export const RomanianCuiSchema = z
  .string()
  .trim()
  .superRefine((value, ctx) => {
    if (!isValidRomanianCui(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'CUI invalid' });
    }
  })
  .transform((value) => {
    const normalized = normalizeCui(value);
    if (!normalized) {
      throw new Error('CUI invalid');
    }
    return normalized;
  });

const nullableText = z.string().nullable();

export const AnafAddressSchema = z.object({
  strada: nullableText,
  numar: nullableText,
  localitate: nullableText,
  judet: nullableText,
  codPostal: nullableText,
  tara: nullableText,
  detalii: nullableText,
});
export type AnafAddress = z.infer<typeof AnafAddressSchema>;

export const AnafCompanySchema = z.object({
  cui: z.string().min(2),
  denumire: z.string().min(1),
  adresa: z.string(),
  nrRegCom: nullableText,
  telefon: nullableText,
  fax: nullableText,
  codPostal: nullableText,
  stareInregistrare: nullableText,
  dataInregistrare: nullableText,
  codCaen: nullableText,
  iban: nullableText,
  statusRoEFactura: z.boolean(),
  organFiscalCompetent: nullableText,
  formaJuridica: nullableText,
  formaProprietate: nullableText,
  formaOrganizare: nullableText,
  scpTva: z.boolean(),
  statusTvaIncasare: z.boolean(),
  statusInactiv: z.boolean(),
  statusSplitTva: z.boolean(),
  adresaSediuSocial: AnafAddressSchema,
});
export type AnafCompany = z.infer<typeof AnafCompanySchema>;

export const BnrRateSchema = z.object({
  currency: z.string().regex(/^[A-Z]{3}$/),
  rate: z.number().positive(),
  multiplier: z.number().int().positive(),
});
export type BnrRate = z.infer<typeof BnrRateSchema>;

export const BnrRatesSchema = z.object({
  publishingDate: z.string().min(1),
  rates: z.array(BnrRateSchema),
});
export type BnrRates = z.infer<typeof BnrRatesSchema>;

export const ResponseSourceSchema = z.enum([
  'anaf_api_v8',
  'bnr_xml',
  'cache_fresh',
  'cache_stale',
]);
export type ResponseSource = z.infer<typeof ResponseSourceSchema>;

export const CircuitStatusSchema = z.enum(['CLOSED', 'OPEN', 'HALF_OPEN']);
export type CircuitStatus = z.infer<typeof CircuitStatusSchema>;

export const ResponseMetaSchema = z.object({
  source: ResponseSourceSchema,
  cached_at: z.string().datetime().nullable(),
  stale: z.boolean(),
  execution_time_ms: z.number().nonnegative(),
  circuit_status: CircuitStatusSchema,
  request_id: z.string().uuid(),
});
export type ResponseMeta = z.infer<typeof ResponseMetaSchema>;

export function createApiResponseSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    ok: z.literal(true),
    data: dataSchema,
    meta: ResponseMetaSchema,
  });
}

export const ApiResponseSchema = createApiResponseSchema(z.unknown());
export type ApiResponse<T> = {
  ok: true;
  data: T;
  meta: ResponseMeta;
};

export const ApiErrorSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
  }),
  meta: z.object({
    request_id: z.string().uuid(),
    execution_time_ms: z.number().nonnegative(),
    stale: z.boolean(),
    source: ResponseSourceSchema.nullable(),
    cached_at: z.string().datetime().nullable(),
    circuit_status: CircuitStatusSchema.nullable(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
