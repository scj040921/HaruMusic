import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ url: vi.fn() }));
vi.mock('@/api/music', () => ({ getMusicUrl: mocks.url }));
vi.mock('@/api/gdmusic', () => ({ parseFromGDMusic: vi.fn() }));
vi.mock('@/api/parseFromCustomApi', () => ({ parseFromCustomApi: vi.fn() }));
vi.mock('@/services/musicSource/transport', () => ({ resolveUnblockMusic: vi.fn() }));
vi.mock('@/store', () => ({ useSettingsStore: vi.fn() }));
import { neteaseProvider } from '@/services/musicSource/providers/builtin';
import type { SongResult } from '@/types/music';

describe('official source adaptive quality', () => {
  beforeEach(() => mocks.url.mockReset());
  it('does not repeat the same access rejection for six qualities', async () => {
    mocks.url.mockResolvedValue({ data: { code: -460 } });
    await expect(neteaseProvider.resolve({ id: 1 } as SongResult, 'auto')).rejects.toMatchObject({
      name: 'SourceAccessRejected',
      code: -460
    });
    expect(mocks.url).toHaveBeenCalledTimes(1);
  });
  it('starts the available top tier without redundant probes', async () => {
    mocks.url.mockResolvedValue({
      data: { code: 200, data: [{ url: 'https://cdn.test/a.mp3', level: 'jymaster', type: 'mp3' }] }
    });
    await expect(neteaseProvider.resolve({ id: 1 } as SongResult, 'auto')).resolves.toMatchObject({
      url: 'https://cdn.test/a.mp3'
    });
    expect(mocks.url).toHaveBeenCalledTimes(1);
  });
});
