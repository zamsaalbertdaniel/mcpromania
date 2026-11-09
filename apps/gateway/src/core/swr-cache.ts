import type { CircuitStatus, ResponseSource } from '@mcpromania/types';
import type { z } from 'zod';

import { CircuitBreaker } from './circuit-breaker.js';
import { AppError, CircuitOpenError } from './errors.js';
import type { RedisPort } from './redis.js';

type CacheEnvelope<T> = {
  data: T;
  cached_at: string;
  fresh_until: number;
  stale_until: number;
};

export type SwrHit<T> = {
  data: T;
  source: ResponseSource;
  cached_at: string | null;
  stale: boolean;
  circuit_status: CircuitStatus;
};

export type SwrLoadOptions<T> = {
  key: string;
  freshTtlSec: number;
  staleTtlSec: number;
  liveSource: Extract<ResponseSource, 'anaf_api_v8' | 'bnr_xml'>;
  circuit: CircuitBreaker;
  schema: z.ZodType<T>;
  load: () => Promise<T>;
};

export class SwrCache {
  constructor(
    private readonly redis: RedisPort,
    private readonly now: () => number = Date.now
  ) {}

  async getOrLoad<T>(options: SwrLoadOptions<T>): Promise<SwrHit<T>> {
    const entry = await this.read(options.key, options.schema);
    const now = this.now();

    if (entry && now < entry.fresh_until) {
      return {
        data: entry.data,
        source: 'cache_fresh',
        cached_at: entry.cached_at,
        stale: false,
        circuit_status: options.circuit.getState(),
      };
    }

    const stale = entry && now < entry.stale_until ? entry : null;
    if (stale && options.circuit.getState() === 'OPEN') {
      return this.staleHit(stale, options.circuit.getState());
    }

    try {
      const data = await options.circuit.execute(options.load);
      const stored = await this.write(options.key, data, options.freshTtlSec, options.staleTtlSec);
      return {
        data: stored.data,
        source: options.liveSource,
        cached_at: stored.cached_at,
        stale: false,
        circuit_status: options.circuit.getState(),
      };
    } catch (error) {
      if (error instanceof AppError && error.status < 500) {
        throw error;
      }
      if (stale) {
        return this.staleHit(stale, options.circuit.getState());
      }
      if (error instanceof CircuitOpenError || error instanceof AppError) {
        throw error;
      }
      throw new AppError(503, 'UPSTREAM_UNAVAILABLE', 'Serviciul este temporar indisponibil');
    }
  }

  private staleHit<T>(entry: CacheEnvelope<T>, circuitStatus: CircuitStatus): SwrHit<T> {
    return {
      data: entry.data,
      source: 'cache_stale',
      cached_at: entry.cached_at,
      stale: true,
      circuit_status: circuitStatus,
    };
  }

  private async read<T>(key: string, schema: z.ZodType<T>): Promise<CacheEnvelope<T> | null> {
    const raw = await this.redis.get(key);
    if (!raw) {
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }
      const record = parsed as Record<string, unknown>;
      const data = schema.parse(record.data);
      if (typeof record.cached_at !== 'string') {
        return null;
      }
      if (typeof record.fresh_until !== 'number' || typeof record.stale_until !== 'number') {
        return null;
      }
      return {
        data,
        cached_at: record.cached_at,
        fresh_until: record.fresh_until,
        stale_until: record.stale_until,
      };
    } catch {
      return null;
    }
  }

  private async write<T>(
    key: string,
    data: T,
    freshTtlSec: number,
    staleTtlSec: number
  ): Promise<CacheEnvelope<T>> {
    const now = this.now();
    const envelope: CacheEnvelope<T> = {
      data,
      cached_at: new Date(now).toISOString(),
      fresh_until: now + freshTtlSec * 1000,
      stale_until: now + staleTtlSec * 1000,
    };
    await this.redis.set(key, JSON.stringify(envelope), 'EX', staleTtlSec);
    return envelope;
  }
}
