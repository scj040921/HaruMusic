import { parsePluginMediaUrl } from '../../shared/musicSourcePlugin';

/** Respect explicit CDN expiry without extending the normal cache lifetime. */
export function mediaUrlExpiresAt(url: string, createdAt: number, depth = 0): number {
  const fallback = createdAt + 30 * 60 * 1000;
  if (depth > 2) return fallback;
  try {
    const plugin = parsePluginMediaUrl(url);
    if (plugin) return mediaUrlExpiresAt(plugin.url, createdAt, depth + 1);
    const parsed = new URL(url);
    if (parsed.pathname === '/__media') {
      const descriptor = JSON.parse(parsed.searchParams.get('d') || '{}');
      if (typeof descriptor.url === 'string')
        return mediaUrlExpiresAt(descriptor.url, createdAt, depth + 1);
    }
    let expiry = fallback;
    for (const [key, raw] of parsed.searchParams) {
      if (!/^(deadline|expires|expire|exp)$/i.test(key)) continue;
      const value = Number(raw);
      // Relative TTLs and opaque signature fields cannot be treated as epoch dates.
      if (!Number.isFinite(value) || value < 1_000_000_000) continue;
      expiry = Math.min(expiry, value < 10_000_000_000 ? value * 1000 : value);
    }
    return expiry;
  } catch {
    return fallback;
  }
}
