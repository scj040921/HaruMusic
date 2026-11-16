import { describe, expect, it } from 'vitest';

import { matchesMusicQuery, sameSong, songKey } from '../src/renderer/utils/songIdentity';

describe('music identity and filtering', () => {
  it('distinguishes providers and typed IDs while supporting legacy default sources', () => {
    expect(sameSong({ id: 1, source: 'netease' }, { id: 1, source: undefined } as any)).toBe(true);
    expect(sameSong({ id: 1, source: 'netease' }, { id: 1, source: 'local' })).toBe(false);
    expect(songKey({ id: 1, source: 'netease' })).not.toBe(songKey({ id: '1', source: 'netease' }));
    expect(sameSong(undefined, { id: 1, source: 'netease' })).toBe(false);
  });
  it('matches every search term across full-width titles and artist names', () => {
    const song = { name: 'JANE DOE', ar: [{ name: '米津玄师' }] };
    expect(matchesMusicQuery(song, 'ｊａｎｅ 米津')).toBe(true);
    expect(matchesMusicQuery(song, 'doe another')).toBe(false);
    expect(matchesMusicQuery(song, '   ')).toBe(true);
    expect(
      matchesMusicQuery({ name: 'Legacy', ar: [], artists: [{ name: 'Artist' }] }, 'legacy artist')
    ).toBe(true);
    expect(
      matchesMusicQuery({ name: 'Legacy', song: { artists: [{ name: 'Singer' }] } }, 'singer')
    ).toBe(true);
  });
});
