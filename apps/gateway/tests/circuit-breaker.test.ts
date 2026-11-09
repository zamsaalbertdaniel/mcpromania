import { describe, expect, it } from 'vitest';

import { CircuitBreaker } from '../src/core/circuit-breaker.js';
import { AppError, CircuitOpenError } from '../src/core/errors.js';

describe('circuit breaker', () => {
  it('opens after 5 consecutive failures, probes after cooldown, and closes on success', async () => {
    const clock = { value: 1_000 };
    const breaker = new CircuitBreaker({
      threshold: 5,
      cooldownMs: 30_000,
      now: () => clock.value,
    });

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await expect(
        breaker.execute(async () => Promise.reject(new Error('timeout')))
      ).rejects.toThrow('timeout');
      expect(breaker.getState()).toBe('CLOSED');
    }

    await expect(breaker.execute(async () => Promise.reject(new Error('timeout')))).rejects.toThrow(
      'timeout'
    );
    expect(breaker.getState()).toBe('OPEN');

    let calls = 0;
    await expect(
      breaker.execute(async () => {
        calls += 1;
        return 'ok';
      })
    ).rejects.toBeInstanceOf(CircuitOpenError);
    expect(calls).toBe(0);

    clock.value += 30_000;
    expect(breaker.getState()).toBe('HALF_OPEN');
    await expect(breaker.execute(async () => 'ok')).resolves.toBe('ok');
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('returns to OPEN when the half-open probe fails', async () => {
    const clock = { value: 0 };
    const breaker = new CircuitBreaker({
      threshold: 5,
      cooldownMs: 1_000,
      now: () => clock.value,
    });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(breaker.execute(async () => Promise.reject(new Error('down')))).rejects.toThrow(
        'down'
      );
    }
    clock.value = 1_000;
    expect(breaker.getState()).toBe('HALF_OPEN');
    await expect(breaker.execute(async () => Promise.reject(new Error('down')))).rejects.toThrow(
      'down'
    );
    expect(breaker.getState()).toBe('OPEN');
    await expect(breaker.execute(async () => 'ok')).rejects.toBeInstanceOf(CircuitOpenError);
  });

  it('does not count a client error as a circuit failure', async () => {
    const breaker = new CircuitBreaker({ threshold: 5, cooldownMs: 30_000, now: () => 0 });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        breaker.execute(async () =>
          Promise.reject(new AppError(404, 'COMPANY_NOT_FOUND', 'missing'))
        )
      ).rejects.toBeInstanceOf(AppError);
    }
    expect(breaker.getState()).toBe('CLOSED');
  });
});
