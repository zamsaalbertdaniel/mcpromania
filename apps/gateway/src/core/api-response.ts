import {
  AnafCompanySchema,
  ApiErrorSchema,
  BnrRatesSchema,
  IbanValidationResultSchema,
  JustSearchResultSchema,
  createApiResponseSchema,
  type AnafCompany,
  type ApiError,
  type ApiResponse,
  type BnrRates,
  type CircuitStatus,
  type IbanValidationResult,
  type JustSearchResult,
  type ResponseSource,
} from '@mcpromania/types';

import type { SwrHit } from './swr-cache.js';

export type RequestClock = {
  requestId: string;
  startedAt: number;
  now: number;
};

export function buildSuccess<T>(
  schema: typeof AnafCompanySchema | typeof BnrRatesSchema,
  hit: SwrHit<T>,
  clock: RequestClock
): ApiResponse<T> {
  const payload = {
    ok: true as const,
    data: hit.data,
    meta: {
      source: hit.source,
      cached_at: hit.cached_at,
      stale: hit.stale,
      execution_time_ms: Math.max(0, clock.now - clock.startedAt),
      circuit_status: hit.circuit_status,
      request_id: clock.requestId,
    },
  };
  return createApiResponseSchema(schema).parse(payload) as ApiResponse<T>;
}

export function buildAnafSuccess(
  hit: SwrHit<AnafCompany>,
  clock: RequestClock
): ApiResponse<AnafCompany> {
  return buildSuccess(AnafCompanySchema, hit, clock);
}

export function buildBnrSuccess(hit: SwrHit<BnrRates>, clock: RequestClock): ApiResponse<BnrRates> {
  return buildSuccess(BnrRatesSchema, hit, clock);
}

export function buildIbanSuccess(
  data: IbanValidationResult,
  clock: RequestClock
): ApiResponse<IbanValidationResult> {
  const payload = {
    ok: true as const,
    data,
    meta: {
      source: 'iban_validator' as const,
      cached_at: null,
      stale: false,
      execution_time_ms: Math.max(0, clock.now - clock.startedAt),
      circuit_status: 'CLOSED' as const,
      request_id: clock.requestId,
    },
  };
  return createApiResponseSchema(IbanValidationResultSchema).parse(
    payload
  ) as ApiResponse<IbanValidationResult>;
}

export function buildJustSuccess(
  hit: SwrHit<JustSearchResult>,
  clock: RequestClock
): ApiResponse<JustSearchResult> {
  const payload = {
    ok: true as const,
    data: hit.data,
    meta: {
      source: hit.source,
      cached_at: hit.cached_at,
      stale: hit.stale,
      execution_time_ms: Math.max(0, clock.now - clock.startedAt),
      circuit_status: hit.circuit_status,
      request_id: clock.requestId,
    },
  };
  return createApiResponseSchema(JustSearchResultSchema).parse(
    payload
  ) as ApiResponse<JustSearchResult>;
}

export function buildError(input: {
  code: string;
  message: string;
  requestId: string;
  startedAt: number;
  now: number;
  stale?: boolean;
  source?: ResponseSource | null;
  cachedAt?: string | null;
  circuitStatus?: CircuitStatus | null;
}): ApiError {
  return ApiErrorSchema.parse({
    ok: false,
    error: {
      code: input.code,
      message: input.message,
    },
    meta: {
      request_id: input.requestId,
      execution_time_ms: Math.max(0, input.now - input.startedAt),
      stale: input.stale ?? false,
      source: input.source ?? null,
      cached_at: input.cachedAt ?? null,
      circuit_status: input.circuitStatus ?? null,
    },
  });
}
