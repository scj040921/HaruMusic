import { describe, expect, it, vi } from 'vitest';

import { isUnplayableMedia, markUnplayableMedia } from '../src/renderer/services/unplayableMedia';
import { buildPluginMediaUrl } from '../src/shared/musicSourcePlugin';
describe('unplayable media fallback', () => {
  it('recognizes a failed proxy URL when the resolver returns its original URL', () => {
    const raw = 'https://example.com/unplayable.flac';
    markUnplayableMedia(buildPluginMediaUrl(raw, { Referer: 'https://example.com' }));
    expect(isUnplayableMedia(raw)).toBe(true);
    expect(isUnplayableMedia('https://example.com/lower.mp3')).toBe(false);
  });
  it('unwraps the Android media bridge before comparing failed sources', () => {
    const raw = 'https://example.com/unsupported.flac';
    const proxy = `http://127.0.0.1:30488/__media?d=${encodeURIComponent(
      JSON.stringify({ url: raw, headers: { Referer: 'https://example.com' } })
    )}`;
    markUnplayableMedia(proxy);
    expect(isUnplayableMedia(raw)).toBe(true);
    expect(isUnplayableMedia('https://example.com/lower.mp3')).toBe(false);
  });
  it('allows retry after the failure expires', () => {
    vi.useFakeTimers();
    try {
      const url = 'https://example.com/temporary.mp3';
      markUnplayableMedia(url);
      vi.advanceTimersByTime(60_001);
      expect(isUnplayableMedia(url)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
