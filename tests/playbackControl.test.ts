import { describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({
  playMusic: { id: 'restored-android-track', name: 'Restored' },
  isPlay: false,
  setPlay: vi.fn(async () => true),
  nextPlay: vi.fn(),
  prevPlay: vi.fn()
}));
vi.mock('@/store/modules/player', () => ({ usePlayerStore: () => store }));

import { usePlaybackControl } from '../src/renderer/hooks/usePlaybackControl';

describe('restored playback controls', () => {
  it('can start a restored track before the lyric singleton has initialized', async () => {
    const control = usePlaybackControl();
    expect(await control.playMusicEvent()).toBe(true);
    expect(store.setPlay).toHaveBeenCalledExactlyOnceWith(store.playMusic);
    expect(store.nextPlay).not.toHaveBeenCalled();
  });
});
