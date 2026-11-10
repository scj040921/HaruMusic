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
vi.mock('@/utils', () => ({ isElectron: true }));
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
    orderedProviders: () => [{ key: 'test', name: 'Test', resolve: mocks.resolve }],
    findProvider: vi.fn()
  })
}));

import { resolveSong } from '../src/renderer/services/musicSource/resolver';

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

  it('keeps playback song quality and playback caching', async () => {
    mocks.getCached.mockResolvedValue(null);
    await resolveSong({ id: 123, name: 'Song' } as any);
    expect(mocks.resolve).toHaveBeenCalledWith(expect.anything(), 'standard', expect.anything());
    expect(mocks.getCached).toHaveBeenCalled();
    expect(mocks.setCached).toHaveBeenCalled();
  });
});
