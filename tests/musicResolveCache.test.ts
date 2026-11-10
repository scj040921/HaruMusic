import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  saveData: vi.fn(),
  getData: vi.fn(),
  deleteData: vi.fn()
}));
vi.mock('@/hooks/MusicHook', () => ({ musicDB: db }));
import { MusicResolveCache } from '../src/renderer/services/musicSource/cache';

describe('quality-aware music cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MusicResolveCache.clearFailedCache(77123);
  });
  it('rejects a URL saved for a different quality', async () => {
    db.getData.mockResolvedValue({
      createTime: Date.now(),
      quality: 'standard',
      sourceKeys: ['netease'],
      entry: { url: 'https://example.com/audio' }
    });
    expect(await MusicResolveCache.getCachedMusicUrl(77123, ['netease'], 'auto')).toBeNull();
    expect(db.deleteData).toHaveBeenCalledWith('music_url_cache', 77123);
  });
  it('does not reuse a failed lookup for a different quality', () => {
    MusicResolveCache.addFailedCache(77123, 'netease', 'standard');
    expect(MusicResolveCache.isInFailedCache(77123, 'netease', 'standard')).toBe(true);
    expect(MusicResolveCache.isInFailedCache(77123, 'netease', 'auto')).toBe(false);
  });
});
