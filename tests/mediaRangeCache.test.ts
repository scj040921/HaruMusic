import { describe, expect, it, vi } from 'vitest';

import { MediaRangeCache } from '../src/shared/mediaRangeCache';

describe('foreground-first media range transport', () => {
  it('bypasses a stalled speculative block for foreground playback', async () => {
    const blockSize = 512 * 1024;
    let nextBlockCalls = 0;
    const upstream = vi.fn(async (_url, options) => {
      const start = Number(/bytes=(\d+)-/.exec(new Headers(options.headers).get('range')!)![1]);
      if (start === blockSize && ++nextBlockCalls === 1) {
        return new Promise<Response>((_resolve, reject) => {
          options.signal.addEventListener('abort', () =>
            reject(new DOMException('Cancelled', 'AbortError'))
          );
        });
      }
      return new Response(new Uint8Array(blockSize), {
        status: 206,
        headers: { 'Content-Range': `bytes ${start}-${start + blockSize - 1}/${3 * blockSize}` }
      });
    });
    const cache = new MediaRangeCache(upstream as typeof fetch);
    try {
      await (
        await cache.fetch('https://cdn.test/a', { headers: { Range: 'bytes=0-0' } })
      ).arrayBuffer();
      const next = await cache.fetch('https://cdn.test/a', {
        headers: { Range: `bytes=${blockSize}-${blockSize}` }
      });
      expect((await next.arrayBuffer()).byteLength).toBe(1);
      expect(nextBlockCalls).toBe(2);
    } finally {
      cache.clear();
    }
  }, 1500);

  it('reuses a verified block when the same song plays again', async () => {
    const upstream = vi.fn(
      async () =>
        new Response(new Uint8Array([1, 2, 3, 4]), {
          status: 206,
          headers: { 'Content-Range': 'bytes 0-3/4', 'Content-Type': 'audio/flac' }
        })
    );
    const cache = new MediaRangeCache(upstream as typeof fetch);
    for (let i = 0; i < 2; i++) {
      const response = await cache.fetch('https://cdn.test/a', { headers: { Range: 'bytes=1-2' } });
      expect(response.headers.get('content-range')).toBe('bytes 1-2/4');
      expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([2, 3]);
    }
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it('does not cache truncated responses as playable data', async () => {
    const upstream = vi.fn(
      async () =>
        new Response(new Uint8Array([1]), {
          status: 206,
          headers: { 'Content-Range': 'bytes 0-3/4' }
        })
    );
    const cache = new MediaRangeCache(upstream as typeof fetch);
    await expect(
      cache.fetch('https://cdn.test/a', { headers: { Range: 'bytes=0-' } })
    ).rejects.toThrow('Truncated');
    expect(upstream).toHaveBeenCalledTimes(2);
  });

  it('terminates pending reads when the player cancels', async () => {
    let cancelled = false;
    const upstream = vi.fn(
      (_url, options) =>
        new Promise<Response>((_resolve, reject) => {
          options.signal.addEventListener('abort', () => {
            cancelled = true;
            reject(new DOMException('Cancelled', 'AbortError'));
          });
        })
    );
    const controller = new AbortController();
    const cache = new MediaRangeCache(upstream as typeof fetch);
    const request = cache.fetch('https://cdn.test/a', {
      headers: { Range: 'bytes=0-' },
      signal: controller.signal
    });
    controller.abort();
    await expect(request).rejects.toThrow('Cancelled');
    expect(cancelled).toBe(true);
  });

  it('falls back to streaming when the server ignores Range', async () => {
    const upstream = vi.fn(async () => new Response(new Uint8Array([1, 2]), { status: 200 }));
    const cache = new MediaRangeCache(upstream as typeof fetch);
    expect(
      (await cache.fetch('https://cdn.test/a', { headers: { Range: 'bytes=0-' } })).status
    ).toBe(200);
  });
});
