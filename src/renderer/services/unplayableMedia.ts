import { parsePluginMediaUrl } from '../../shared/musicSourcePlugin';
const failed = new Map<string, number>();
const unwrapAndroidMediaProxy = (url: string): string | null => {
  try {
    const parsed = new URL(url);
    if (parsed.pathname !== '/__media') return null;
    const payload = parsed.searchParams.get('d');
    if (!payload) return null;
    const descriptor = JSON.parse(payload) as { url?: unknown };
    return typeof descriptor.url === 'string' ? descriptor.url : null;
  } catch {
    return null;
  }
};

const canonical = (url: string) => {
  const mediaUrl = unwrapAndroidMediaProxy(url) || url;
  return parsePluginMediaUrl(mediaUrl)?.url || mediaUrl;
};
export const markUnplayableMedia = (url: string) => {
  failed.set(canonical(url), Date.now() + 60_000);
};
export const isUnplayableMedia = (url: string): boolean => {
  const key = canonical(url);
  const expiry = failed.get(key);
  if (expiry === undefined) return false;
  if (expiry <= Date.now()) {
    failed.delete(key);
    return false;
  }
  return true;
};
