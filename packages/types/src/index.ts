import { z } from 'zod';

// Admin Client (service_role) se folosește doar în workers. Gateway-ul folosește întotdeauna client scoped pe tenant_id.

export const PlanTierSchema = z.enum(['free', 'pro', 'agency', 'custom']);
export type PlanTier = z.infer<typeof PlanTierSchema>;

export const PLAN_MONTHLY_LIMITS: Record<PlanTier, number> = {
  free: 100,
  pro: 5_000,
  agency: 15_000,
  custom: 30_000,
};

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
  planTier: PlanTierSchema.default('free'),
  monthlyLimit: z.number().int().positive().default(100),
  isActive: z.boolean().default(true),
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
      ctx.addIssue({ code: 'custom', message: 'CUI invalid' });
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

export const IbanValidationResultSchema = z.object({
  iban: z.string(),
  formatted: z.string(),
  isValid: z.boolean(),
  countryCode: z.string(),
  isRomanian: z.boolean(),
  bankCode: z.string().nullable(),
  bankName: z.string().nullable(),
  swiftBic: z.string().nullable(),
  isTreasury: z.boolean(),
  accountNumber: z.string().nullable(),
  validationError: z.string().nullable(),
});
export type IbanValidationResult = z.infer<typeof IbanValidationResultSchema>;

export const JustParteSchema = z.object({
  nume: z.string(),
  calitateParte: z.string(),
});
export type JustParte = z.infer<typeof JustParteSchema>;

export const JustSedintaSchema = z.object({
  complet: z.string().nullable(),
  data: z.string().nullable(),
  ora: z.string().nullable(),
  solutie: z.string().nullable(),
  solutieSumar: z.string().nullable(),
  dataPronuntare: z.string().nullable(),
  documentSedinta: z.string().nullable(),
  numarDocument: z.string().nullable(),
  dataDocument: z.string().nullable(),
});
export type JustSedinta = z.infer<typeof JustSedintaSchema>;

export const JustCaleAtacSchema = z.object({
  dataDeclarare: z.string().nullable(),
  parteDeclaratoare: z.string().nullable(),
  tipCaleAtac: z.string().nullable(),
});
export type JustCaleAtac = z.infer<typeof JustCaleAtacSchema>;

export const JustDosarSchema = z.object({
  numar: z.string(),
  numarVechi: z.string().nullable(),
  data: z.string().nullable(),
  institutie: z.string(),
  departament: z.string().nullable(),
  categorieCaz: z.string().nullable(),
  stadiuProcesual: z.string().nullable(),
  obiect: z.string().nullable(),
  dataModificare: z.string().nullable(),
  parti: z.array(JustParteSchema),
  sedinte: z.array(JustSedintaSchema),
  caiAtac: z.array(JustCaleAtacSchema),
});
export type JustDosar = z.infer<typeof JustDosarSchema>;

export const JustSearchResultSchema = z.object({
  query: z.string(),
  queryType: z.enum(['numarDosar', 'numeParte']),
  totalCases: z.number().int().nonnegative(),
  cases: z.array(JustDosarSchema),
});
export type JustSearchResult = z.infer<typeof JustSearchResultSchema>;

export const OnrcEntityTypeSchema = z.object({
  code: z.enum(['J', 'F', 'C']),
  name: z.string(),
  category: z.enum(['juridica', 'fizica', 'cooperativa']),
});
export type OnrcEntityType = z.infer<typeof OnrcEntityTypeSchema>;

export const OnrcCountySchema = z.object({
  code: z.string(),
  name: z.string(),
  region: z.string(),
  orctOffice: z.string(),
  competentCourt: z.string(),
  courtCodeJust: z.string(),
});
export type OnrcCounty = z.infer<typeof OnrcCountySchema>;

export const OnrcRegistrationSchema = z.object({
  raw: z.string(),
  formatted: z.string().nullable(),
  isValid: z.boolean(),
  entityType: OnrcEntityTypeSchema.nullable(),
  county: OnrcCountySchema.nullable(),
  serialNumber: z.number().int().positive().nullable(),
  year: z.number().int().positive().nullable(),
  validationError: z.string().nullable(),
});
export type OnrcRegistration = z.infer<typeof OnrcRegistrationSchema>;

export const OnrcCompanyProfileSchema = z.object({
  cui: z.string(),
  name: z.string(),
  address: z.string(),
  onrc: OnrcRegistrationSchema,
  status: z.object({
    isActive: z.boolean(),
    isInactiveFiscal: z.boolean(),
    isVatPayer: z.boolean(),
    vatSplit: z.boolean(),
  }),
  registrationDate: z.string().nullable(),
  ageYears: z.number().int().nonnegative().nullable(),
});
export type OnrcCompanyProfile = z.infer<typeof OnrcCompanyProfileSchema>;

export const InsolvencyStatusSchema = z.enum([
  'IN_BONIS',
  'CERERE_INREGISTRATA',
  'INSOLVENTA_DESCHISA',
  'REORGANIZARE_JUDICIARA',
  'FALIMENT',
  'INCHISA',
]);
export type InsolvencyStatus = z.infer<typeof InsolvencyStatusSchema>;

export const InsolvencyRiskLevelSchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export type InsolvencyRiskLevel = z.infer<typeof InsolvencyRiskLevelSchema>;

export const InsolvencyPartySchema = z.object({
  name: z.string(),
  role: z.string(),
});
export type InsolvencyParty = z.infer<typeof InsolvencyPartySchema>;

export const InsolvencyHearingSchema = z.object({
  date: z.string().nullable(),
  solution: z.string().nullable(),
  summary: z.string().nullable(),
});
export type InsolvencyHearing = z.infer<typeof InsolvencyHearingSchema>;

export const InsolvencyCaseSchema = z.object({
  caseNumber: z.string(),
  court: z.string(),
  department: z.string().nullable(),
  filingDate: z.string().nullable(),
  status: InsolvencyStatusSchema,
  object: z.string().nullable(),
  stage: z.string().nullable(),
  judicialAdministrator: z.string().nullable(),
  parties: z.array(InsolvencyPartySchema),
  lastHearing: InsolvencyHearingSchema.nullable(),
});
export type InsolvencyCase = z.infer<typeof InsolvencyCaseSchema>;

export const InsolvencyReportSchema = z.object({
  cui: z.string().nullable(),
  name: z.string(),
  status: InsolvencyStatusSchema,
  hasInsolvencyRisk: z.boolean(),
  riskLevel: InsolvencyRiskLevelSchema,
  summary: z.string(),
  totalCases: z.number().int().nonnegative(),
  cases: z.array(InsolvencyCaseSchema),
});
export type InsolvencyReport = z.infer<typeof InsolvencyReportSchema>;

export const ResponseSourceSchema = z.enum([
  'anaf_api_v8',
  'bnr_xml',
  'iban_validator',
  'portal_just',
  'onrc_validator',
  'onrc_company',
  'portal_just_insolvency',
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

export const WaitlistSubmissionSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(5, 'Adresa de email este prea scurtă')
    .max(254, 'Adresa de email este prea lungă')
    .email('Introduceți o adresă de email validă'),
  fullName: z
    .string()
    .trim()
    .min(2, 'Numele complet trebuie să aibă cel puțin 2 caractere')
    .max(120, 'Numele complet este prea lung'),
  companyName: z
    .string()
    .trim()
    .max(160, 'Numele companiei este prea lung')
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  planTier: PlanTierSchema.default('pro'),
  useCase: z
    .string()
    .trim()
    .max(500, 'Descrierea cazului de utilizare nu poate depăși 500 de caractere')
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  source: z.string().trim().min(1).max(64).optional().default('website'),
});
export type WaitlistSubmission = z.infer<typeof WaitlistSubmissionSchema>;
