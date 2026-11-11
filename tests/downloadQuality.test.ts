import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  getCached: vi.fn(),
  setCached: vi.fn(),
  failed: vi.fn(),
  addFailed: vi.fn()
}));

vi.mock('@/services/songQuality', () => ({ getSongQuality: () => 'standard' }));
vi.mock('@/services/SongSourceConfigManager', () => ({
  SongSourceConfigManager: { getConfig: () => null }
}));
vi.mock('@/store', () => ({
  useSettingsStore: () => ({ setData: { musicQuality: 'higher', enabledMusicSources: [] } })
}));
vi.mock('@/utils', () => ({ isElectron: true, isAndroidApp: false }));
vi.mock('@/services/musicSource/cache', () => ({
  MusicResolveCache: {
    getCachedMusicUrl: mocks.getCached,
    setCachedMusicUrl: mocks.setCached,
    isInFailedCache: mocks.failed,
    addFailedCache: mocks.addFailed
  }
}));
vi.mock('@/services/musicSource/registry', () => ({
  useMusicSourceRegistry: () => ({
    orderedProviders: () => [
      { key: 'test', name: 'Test', plugin: { dialect: 'native' }, resolve: mocks.resolve }
    ],
    findProvider: vi.fn()
  })
}));

import { resolveSong } from '../src/renderer/services/musicSource/resolver';
import { markUnplayableMedia } from '../src/renderer/services/unplayableMedia';

describe('download quality', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('window', { api: {} });
    mocks.resolve.mockResolvedValue({ url: 'https://example.com/audio.flac', format: 'flac' });
    mocks.failed.mockReturnValue(false);
  });

  it('starts from automatic highest quality without reading or writing playback caches', async () => {
    await resolveSong({ id: 123, name: 'Song' } as any, { isDownload: true });
    expect(mocks.resolve).toHaveBeenCalledWith(
      expect.anything(),
      'auto',
      expect.objectContaining({ isDownload: true })
    );
    expect(mocks.getCached).not.toHaveBeenCalled();
    expect(mocks.failed).not.toHaveBeenCalled();
    expect(mocks.setCached).not.toHaveBeenCalled();
    expect(mocks.addFailed).not.toHaveBeenCalled();
  });

  it('skips an audio URL that failed loading and tries the next quality', async () => {
    mocks.getCached.mockResolvedValue(null);
    markUnplayableMedia('https://example.com/high.flac');
    mocks.resolve.mockImplementation(async (_song, quality) => ({
      url: quality === 'auto' ? 'https://example.com/high.flac' : 'https://example.com/playable.mp3'
    }));
    const result = await resolveSong({ id: 321, name: 'Fallback' } as any);
    expect(result?.media.url).toBe('https://example.com/playable.mp3');
    expect(mocks.resolve.mock.calls.map((call) => call[1])).toEqual(['auto', 'hires']);
  });

  it('uses auto for playback despite legacy song/global quality, keeping playback caching', async () => {
    mocks.getCached.mockResolvedValue(null);
    await resolveSong({ id: 123, name: 'Song' } as any);
    expect(mocks.resolve).toHaveBeenCalledWith(expect.anything(), 'auto', expect.anything());
    expect(mocks.getCached).toHaveBeenCalled();
    expect(mocks.setCached).toHaveBeenCalled();
  });
});
