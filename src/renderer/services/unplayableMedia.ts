import { parsePluginMediaUrl } from '../../shared/musicSourcePlugin';
const failed = new Map<string, number>();
const canonical = (url: string) => parsePluginMediaUrl(url)?.url || url;
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
