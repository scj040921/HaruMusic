import { afterEach, describe, expect, it, vi } from 'vitest';

import { nearestTab, stepLiquidSpring } from '../src/renderer/utils/liquidSpring';
import { readLyricConfig, writeLyricConfig } from '../src/renderer/utils/lyricConfig';

afterEach(() => vi.unstubAllGlobals());

describe('liquid tab gestures', () => {
  it('settles after reversing a moving spring, even after a background-frame delay', () => {
    let state = { position: 0, velocity: 0 };
    for (let i = 0; i < 8; i++)
      state = stepLiquidSpring(state.position, state.velocity, 300, 1 / 60);
    expect(state.velocity).toBeGreaterThan(0);
    state = stepLiquidSpring(state.position, state.velocity, 20, 5);
    expect(Number.isFinite(state.position)).toBe(true);
    for (let i = 0; i < 120; i++)
      state = stepLiquidSpring(state.position, state.velocity, 20, 1 / 60);
    expect(state.position).toBeCloseTo(20, 3);
    expect(Math.abs(state.velocity)).toBeLessThan(0.01);
  });

  it('selects the nearest tab and clamps to endpoints', () => {
    const centers = [30, 90, 150, 210];
    expect(nearestTab(-500, centers)).toBe(0);
    expect(nearestTab(139, centers)).toBe(2);
    expect(nearestTab(900, centers)).toBe(3);
  });
});

describe('removed mode configuration migration', () => {
  it('drops obsolete fields while preserving lyric preferences on read and write', () => {
    const values = new Map([
      [
        'music-full-config',
        JSON.stringify({
          fontSize: 30,
          centerLyrics: true,
          saltKeepAwake: true,
          saltPlayerTheme: 'dark'
        })
      ]
    ]);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) || null,
      setItem: (key: string, value: string) => values.set(key, value)
    });
    vi.stubGlobal('window', { dispatchEvent: vi.fn() });
    const config = readLyricConfig();
    expect(config.fontSize).toBe(30);
    expect(config.centerLyrics).toBe(true);
    expect(Object.keys(config).some((key) => key.startsWith('salt'))).toBe(false);
    writeLyricConfig(config);
    expect(values.get('music-full-config')).not.toContain('salt');
  });
});
