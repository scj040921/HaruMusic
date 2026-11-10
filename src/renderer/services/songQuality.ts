export const SONG_QUALITIES = [
  'auto',
  'jymaster',
  'hires',
  'lossless',
  'exhigh',
  'higher',
  'standard',
  'jyeffect',
  'sky',
  'dolby'
] as const;
export type SongQuality = (typeof SONG_QUALITIES)[number];
const PREFIX = 'song_quality_';

export function getSongQuality(songId: string | number): SongQuality | null {
  try {
    const quality = localStorage.getItem(PREFIX + songId);
    return SONG_QUALITIES.includes(quality as SongQuality) ? (quality as SongQuality) : null;
  } catch {
    return null;
  }
}

export function setSongQuality(songId: string | number, quality: SongQuality | null): void {
  try {
    if (quality) localStorage.setItem(PREFIX + songId, quality);
    else localStorage.removeItem(PREFIX + songId);
  } catch {
    /* Playback remains usable if browser storage is unavailable. */
  }
}
