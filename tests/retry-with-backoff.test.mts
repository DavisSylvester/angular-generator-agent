import { describe, expect, it } from 'bun:test';
import { createLogger, transports } from 'winston';
import { retryWithBackoff } from '../src/utils/retry-with-backoff.mts';

const silentLogger = createLogger({ silent: true, transports: [new transports.Console()] });

const defaultOpts = {
  maxAttempts: 3,
  baseDelayMs: 10, // tiny delays for tests
  maxDelayMs: 50,
  jitter: 0,
  label: `test-op`,
};

describe(`retryWithBackoff`, () => {
  it(`should return immediately on first success`, async () => {
    let calls = 0;
    const result = await retryWithBackoff(
      async () => { calls++; return `ok`; },
      defaultOpts,
      silentLogger,
    );
    expect(result).toBe(`ok`);
    expect(calls).toBe(1);
  });

  it(`should retry on failure and succeed on second attempt`, async () => {
    let calls = 0;
    const result = await retryWithBackoff(
      async () => {
        calls++;
        if (calls < 2) throw new Error(`transient`);
        return `recovered`;
      },
      defaultOpts,
      silentLogger,
    );
    expect(result).toBe(`recovered`);
    expect(calls).toBe(2);
  });

  it(`should throw after exhausting all attempts`, async () => {
    let calls = 0;
    await expect(
      retryWithBackoff(
        async () => { calls++; throw new Error(`permanent`); },
        defaultOpts,
        silentLogger,
      ),
    ).rejects.toThrow(`permanent`);
    expect(calls).toBe(3);
  });

  it(`should respect maxAttempts=1 (no retries)`, async () => {
    let calls = 0;
    await expect(
      retryWithBackoff(
        async () => { calls++; throw new Error(`fail`); },
        { ...defaultOpts, maxAttempts: 1 },
        silentLogger,
      ),
    ).rejects.toThrow(`fail`);
    expect(calls).toBe(1);
  });

  it(`should succeed on the last possible attempt`, async () => {
    let calls = 0;
    const result = await retryWithBackoff(
      async () => {
        calls++;
        if (calls < 3) throw new Error(`not yet`);
        return `finally`;
      },
      defaultOpts,
      silentLogger,
    );
    expect(result).toBe(`finally`);
    expect(calls).toBe(3);
  });

  it(`should apply exponential backoff (delay doubles)`, async () => {
    const timestamps: number[] = [];
    let calls = 0;

    await retryWithBackoff(
      async () => {
        timestamps.push(Date.now());
        calls++;
        if (calls < 3) throw new Error(`wait`);
        return `done`;
      },
      { maxAttempts: 3, baseDelayMs: 50, maxDelayMs: 500, jitter: 0, label: `backoff-test` },
      silentLogger,
    );

    // Second attempt should wait ~50ms, third ~100ms
    const gap1 = timestamps[1]! - timestamps[0]!;
    const gap2 = timestamps[2]! - timestamps[1]!;
    expect(gap1).toBeGreaterThanOrEqual(40); // allow some timing slack
    expect(gap2).toBeGreaterThanOrEqual(80);
  });

  it(`should cap delay at maxDelayMs`, async () => {
    const timestamps: number[] = [];
    let calls = 0;

    await retryWithBackoff(
      async () => {
        timestamps.push(Date.now());
        calls++;
        if (calls < 4) throw new Error(`wait`);
        return `done`;
      },
      { maxAttempts: 4, baseDelayMs: 50, maxDelayMs: 60, jitter: 0, label: `cap-test` },
      silentLogger,
    );

    // Third gap would be 200ms uncapped, but should be capped at 60ms
    const gap3 = timestamps[3]! - timestamps[2]!;
    expect(gap3).toBeLessThan(100);
  });
});
