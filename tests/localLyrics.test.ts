import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchLocalLyrics,
  findLocalLyricsMatch,
  findLocalLyricsSongId
} from '@/services/localLyrics';

const mocks = vi.hoisted(() => ({ getSearch: vi.fn() }));

vi.mock('@/api/search', () => ({ getSearch: mocks.getSearch }));

describe('local music lyric catalog matching', () => {
  beforeEach(() => mocks.getSearch.mockReset());

  it('matches exact title and an exact artist despite punctuation and width differences', () => {
    const match = findLocalLyricsMatch(
      [
        { id: 1, name: 'Blue Bird', ar: [{ name: 'Other Artist' }] },
        { id: 2, name: 'Ｂｌｕｅ　Ｂｉｒｄ！', ar: [{ name: 'Ikimono-gakari' }] }
      ],
      'Blue Bird',
      'Ikimono-gakari'
    );

    expect(match?.id).toBe(2);
  });

  it('does not use a same-title song by a different artist', () => {
    const match = findLocalLyricsMatch(
      [{ id: 1, name: 'Home', ar: [{ name: 'Someone Else' }] }],
      'Home',
      'My Artist'
    );

    expect(match).toBeUndefined();
  });

  it('returns the matched numeric catalog ID from search results', async () => {
    mocks.getSearch.mockResolvedValueOnce({
      data: {
        result: {
          songs: [{ id: 73, name: 'Night Drive', ar: [{ name: 'Artist' }] }]
        }
      }
    });

    await expect(findLocalLyricsSongId('Night Drive', 'Artist')).resolves.toBe(73);
    expect(mocks.getSearch).toHaveBeenCalledWith({
      keywords: 'Artist Night Drive',
      type: 1,
      limit: 30,
      offset: 0
    });
  });

  it('returns no match when catalog search fails', async () => {
    mocks.getSearch.mockRejectedValueOnce(new Error('offline'));

    await expect(findLocalLyricsSongId('Night Drive', 'Artist')).resolves.toBeUndefined();
  });

  it('loads timed lyrics only after an exact local catalog match', async () => {
    mocks.getSearch.mockResolvedValueOnce({
      data: {
        result: {
          songs: [{ id: 73, name: 'Night Drive', ar: [{ name: 'Artist' }] }]
        }
      }
    });
    const lyrics = { lrcArray: [{ text: 'Line' }], lrcTimeArray: [1] };
    const loadLyrics = vi.fn().mockResolvedValue(lyrics);

    await expect(fetchLocalLyrics('Night Drive', 'Artist', loadLyrics)).resolves.toEqual(lyrics);
    expect(loadLyrics).toHaveBeenCalledWith(73);
  });
});
