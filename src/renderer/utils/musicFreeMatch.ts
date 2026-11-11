import type { SongResult } from '@/types/music';

const variants: Record<string, string> = {
  師: '师',
  樂: '乐',
  陳: '陈',
  張: '张',
  劉: '刘',
  楊: '杨',
  葉: '叶',
  鄧: '邓',
  鄭: '郑',
  許: '许',
  蕭: '萧',
  華: '华',
  龍: '龙',
  馬: '马',
  雲: '云'
};
const normalize = (value: string) =>
  value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[師樂陳張劉楊葉鄧鄭許蕭華龍馬雲]/g, (char) => variants[char] || char)
    .replace(/[\s\p{P}\p{S}]/gu, '');
const artistNames = (value: unknown): string[] => {
  if (Array.isArray(value))
    return value.flatMap((item) =>
      artistNames(typeof item === 'object' && item ? item.name : item)
    );
  return typeof value === 'string'
    ? value
        .split(/[/、;&,]/)
        .map(normalize)
        .filter(Boolean)
    : [];
};

/** Keep the plugin's native IDs, hashes and quality descriptors. Never substitute
 * a same-title cover by another artist when matching a foreign catalog. */
export function matchMusicFreeItem(song: SongResult, items: unknown[]): Record<string, any> | null {
  const title = normalize(song.name || '');
  const artists = artistNames(
    (song.ar || song.artists || []).flatMap((item) => [item.name, ...((item as any).alias || [])])
  );
  const duration = song.dt
    ? song.dt / 1000
    : (song.duration || 0) > 14400
      ? (song.duration || 0) / 1000
      : song.duration || 0;
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const candidate = item as Record<string, any>;
    if (normalize(String(candidate.title || candidate.name || '')) !== title) continue;
    const candidates = artistNames(candidate.artist || candidate.artists || candidate.ar);
    if (artists.length && !artists.some((name) => candidates.includes(name))) continue;
    const rawDuration = Number(candidate.duration || 0);
    const candidateDuration = rawDuration > 14400 ? rawDuration / 1000 : rawDuration;
    if (duration && candidateDuration && Math.abs(duration - candidateDuration) > 10) continue;
    return candidate;
  }
  return null;
}

export const musicCatalog = (platform: string): string => {
  if (/netease|网易|網易|^wy$|^163$/i.test(platform)) return 'netease';
  if (/qq|腾讯|騰訊|^tx$/i.test(platform)) return 'qq';
  if (/kugou|酷狗|^kg$/i.test(platform)) return 'kugou';
  if (/kuwo|酷我|^kw$/i.test(platform)) return 'kuwo';
  if (/bili|哔哩|嗶哩/i.test(platform)) return 'bilibili';
  return platform.toLowerCase();
};
