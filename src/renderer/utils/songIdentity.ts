import type { SongResult } from '@/types/music';

type SongIdentity = Pick<SongResult, 'id' | 'source'>;
export const songKey = (song: SongIdentity): string =>
  JSON.stringify([song.source || 'netease', typeof song.id, song.id]);
export const sameSong = (left?: SongIdentity | null, right?: SongIdentity | null): boolean =>
  !!left &&
  !!right &&
  left.id === right.id &&
  (left.source || 'netease') === (right.source || 'netease');

export const matchesMusicQuery = (
  song: {
    name?: string;
    ar?: Array<{ name: string }>;
    artists?: Array<{ name: string }>;
    song?: { artists?: Array<{ name: string }> };
    artist?: string;
  },
  query: string
) => {
  const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase();
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  const text = normalize(
    [
      song.name,
      song.artist,
      ...[...(song.ar || []), ...(song.artists || []), ...(song.song?.artists || [])].map(
        (artist) => artist.name
      )
    ]
      .filter(Boolean)
      .join(' ')
  );
  return terms.every((term) => text.includes(term));
};
