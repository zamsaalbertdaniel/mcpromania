import type { CircuitStatus } from '@mcpromania/types';

import { AppError, CircuitOpenError } from './errors.js';

export type CircuitBreakerOptions = {
  threshold?: number;
  cooldownMs?: number;
  now?: () => number;
};

export class CircuitBreaker {
  private state: CircuitStatus = 'CLOSED';

  private failures = 0;

  private openedAt = 0;

  private probeInFlight = false;

  private readonly threshold: number;

  private readonly cooldownMs: number;

  private readonly now: () => number;

  constructor(options: CircuitBreakerOptions = {}) {
    this.threshold = options.threshold ?? 5;
    this.cooldownMs = options.cooldownMs ?? 30_000;
    this.now = options.now ?? (() => Date.now());
  }

  getState(): CircuitStatus {
    this.transition();
    return this.state;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.transition();
    if (this.state === 'OPEN' || (this.state === 'HALF_OPEN' && this.probeInFlight)) {
      throw new CircuitOpenError();
    }
    if (this.state === 'HALF_OPEN') {
      this.probeInFlight = true;
    }

    try {
      const result = await fn();
      this.failures = 0;
      this.probeInFlight = false;
      this.state = 'CLOSED';
      return result;
    } catch (error) {
      this.probeInFlight = false;
      if (error instanceof AppError && error.status < 500) {
        throw error;
      }
      this.failures += 1;
      if (this.state === 'HALF_OPEN' || this.failures >= this.threshold) {
        this.state = 'OPEN';
        this.openedAt = this.now();
      }
      throw error;
    }
  }

  private transition(): void {
    if (this.state === 'OPEN' && this.now() - this.openedAt >= this.cooldownMs) {
      this.state = 'HALF_OPEN';
      this.probeInFlight = false;
    }
  }
}
