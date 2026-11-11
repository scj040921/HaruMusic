import { describe, expect, it } from 'vitest';

import { mediaUrlExpiresAt } from '@/utils/mediaUrlExpiry';

describe('signed media URL expiry', () => {
  const createdAt = 1_790_000_000_000;
  it('honors an earlier CDN deadline', () => {
    expect(mediaUrlExpiresAt('https://cdn.example/audio?deadline=1790000060', createdAt)).toBe(
      createdAt + 60_000
    );
  });
  it('honors the upstream expiry inside the Android proxy', () => {
    const descriptor = encodeURIComponent(
      JSON.stringify({ url: 'https://cdn.example/audio?expires=1790000060' })
    );
    expect(mediaUrlExpiresAt(`http://127.0.0.1:30488/__media?d=${descriptor}`, createdAt)).toBe(
      createdAt + 60_000
    );
  });
  it('does not extend the cache for far-future or relative expiry values', () => {
    expect(mediaUrlExpiresAt('https://cdn.example/audio?exp=9999999999', createdAt)).toBe(
      createdAt + 1_800_000
    );
    expect(mediaUrlExpiresAt('https://cdn.example/audio?expires=3600', createdAt)).toBe(
      createdAt + 1_800_000
    );
  });
});
