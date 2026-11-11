import { getSearch } from '@/api/search';
import type { ILyric } from '@/types/music';

type SearchSong = {
  id: number | string;
  name: string;
  alia?: string[];
  ar?: Array<{ name?: string }>;
  artists?: Array<{ name?: string }>;
};

const normalize = (value: string): string =>
  value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, '');

const splitArtists = (value: string): string[] =>
  value
    .split(/\s*(?:\/|、|;|＆|&|feat\.?|ft\.?)\s*/i)
    .map(normalize)
    .filter(Boolean);

/** Match by exact title and, when available, at least one exact artist. */
export const findLocalLyricsMatch = (
  songs: SearchSong[],
  title: string,
  artist = ''
): SearchSong | undefined => {
  const expectedTitle = normalize(title);
  if (!expectedTitle) return undefined;
  const expectedArtists = splitArtists(artist);

  return songs.find((song) => {
    const titles = [song.name, ...(song.alia || [])].map(normalize);
    if (!titles.includes(expectedTitle)) return false;
    if (!expectedArtists.length) return true;

    const resultArtists = (song.ar || song.artists || [])
      .map((item) => normalize(item.name || ''))
      .filter(Boolean);
    return resultArtists.some((name) => expectedArtists.includes(name));
  });
};

/** Resolve local file tags to a catalog ID so the existing lyric API can fill gaps. */
export const findLocalLyricsSongId = async (
  title: string,
  artist = ''
): Promise<number | undefined> => {
  const keywords = [artist.trim(), title.trim()].filter(Boolean).join(' ');
  if (!keywords) return undefined;

  try {
    const { data } = await getSearch({ keywords, type: 1, limit: 30, offset: 0 });
    const songs = Array.isArray(data?.result?.songs) ? (data.result.songs as SearchSong[]) : [];
    const match = findLocalLyricsMatch(songs, title, artist);
    const id = Number(match?.id);
    return Number.isFinite(id) && id > 0 ? id : undefined;
  } catch (error) {
    console.info('[localLyrics] 在线歌词匹配失败:', error);
    return undefined;
  }
};

export const fetchLocalLyrics = async (
  title: string,
  artist: string,
  loadLyrics: (songId: number) => Promise<ILyric>
): Promise<ILyric | undefined> => {
  const songId = await findLocalLyricsSongId(title, artist);
  if (!songId) return undefined;

  try {
    const lyrics = await loadLyrics(songId);
    return lyrics.lrcTimeArray?.length ? lyrics : undefined;
  } catch {
    return undefined;
  }
};
