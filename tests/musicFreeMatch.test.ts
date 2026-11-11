import { describe, expect, it } from 'vitest';

import type { SongResult } from '@/types/music';
import { matchMusicFreeItem, musicCatalog } from '@/utils/musicFreeMatch';

describe('matching a foreign MusicFree catalog', () => {
  const song = {
    id: 2745026895,
    name: 'IRIS OUT',
    ar: [{ name: '米津玄師' }],
    dt: 179000
  } as SongResult;
  it('keeps the matched provider ID, hash and quality fields', () => {
    const candidate = {
      id: 'qq-mid',
      title: 'IRIS OUT',
      artist: '米津玄师',
      duration: 179,
      hash: 'native-hash',
      qualities: { super: { hash: 'lossless-hash' } }
    };
    expect(matchMusicFreeItem(song, [candidate])).toBe(candidate);
  });
  it('rejects a same-title cover by another artist', () => {
    expect(
      matchMusicFreeItem(song, [{ id: 'cover', title: 'IRIS OUT', artist: 'Kotoha' }])
    ).toBeNull();
  });
  it('rejects a different recording duration', () => {
    expect(
      matchMusicFreeItem(song, [{ title: 'IRIS OUT', artist: '米津玄師', duration: 60 }])
    ).toBeNull();
  });
  it('recognizes source platform names', () => {
    expect(musicCatalog('网易云音乐')).toBe('netease');
    expect(musicCatalog('QQ音乐')).toBe('qq');
  });
});
