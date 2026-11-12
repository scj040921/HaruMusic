import { afterEach, describe, expect, it, vi } from 'vitest';

import { firstAvailable } from '../src/renderer/services/musicSource/hedgedResolve';
afterEach(() => vi.useRealTimers());
describe('bounded source fallback', () => {
  it('accepts a working fallback while the first source is still stalled', async () => {
    vi.useFakeTimers();
    const fallback = vi.fn(async () => 'audio');
    const pending = firstAvailable([() => new Promise<string | null>(() => {}), fallback]);
    await vi.advanceTimersByTimeAsync(349);
    expect(fallback).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toBe('audio');
  });
  it('does not start other sources when the preferred source succeeds quickly', async () => {
    vi.useFakeTimers();
    const fallback = vi.fn(async () => 'other');
    expect(await firstAvailable([async () => 'preferred', fallback])).toBe('preferred');
    await vi.advanceTimersByTimeAsync(1000);
    expect(fallback).not.toHaveBeenCalled();
  });
  it('keeps at most two requests active even when an early failure overlaps the hedge timer', async () => {
    vi.useFakeTimers();
    let active = 0,
      max = 0;
    const finish: Array<(value: string | null) => void> = [];
    const tasks = Array.from(
      { length: 5 },
      () => () =>
        new Promise<string | null>((resolve) => {
          active++;
          max = Math.max(max, active);
          finish.push((value) => {
            active--;
            resolve(value);
          });
        })
    );
    const result = firstAvailable(tasks);
    await vi.advanceTimersByTimeAsync(100);
    finish[0](null);
    await vi.advanceTimersByTimeAsync(250);
    expect(max).toBe(2);
    finish[1]('winner');
    expect(await result).toBe('winner');
    await vi.advanceTimersByTimeAsync(1000);
    expect(finish.length).toBe(3);
    finish[2](null);
  });
  it('returns an empty result when all sources reject or miss', async () => {
    expect(
      await firstAvailable([
        async () => {
          throw Error('offline');
        },
        async () => null
      ])
    ).toBeNull();
  });
});
