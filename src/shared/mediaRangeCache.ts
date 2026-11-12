import { clearTimeout, setTimeout } from 'node:timers';

/** Bounded range transport. Inspired by Salt Extend Online's foreground-first
 * range scheduling; implemented for Fetch streams and HTML audio. */
const BLOCK = 512 * 1024;
type Block = { bytes: Uint8Array; total: number; type: string; expiry: number };
type Pending = { promise: Promise<Block>; controller: AbortController; speculative: boolean };
class Unranged extends Error {
  constructor(readonly response: Response) {
    super('Server does not support ranges');
  }
}

export class MediaRangeCache {
  private cache = new Map<string, Block>();
  private pending = new Map<string, Pending>();
  private used = 0;
  private revision = 0;
  private speculative?: AbortController;
  private plan?: { key: string; first: number };
  private unranged = new Map<string, number>();
  constructor(
    private fetcher: typeof fetch = fetch,
    private limit = 24 * 1024 * 1024,
    private blockSize = BLOCK,
    private streamPlayback = false
  ) {}

  clear(): void {
    this.cancelSpeculation();
    for (const task of this.pending.values()) task.controller.abort();
    this.pending.clear();
    this.cache.clear();
    this.unranged.clear();
    this.used = 0;
  }

  private cancelSpeculation() {
    this.revision++;
    this.speculative?.abort();
    this.speculative = undefined;
  }

  private cached(key: string): Block | undefined {
    const block = this.cache.get(key);
    if (!block) return;
    if (block.expiry <= Date.now()) {
      this.cache.delete(key);
      this.used -= block.bytes.length;
      return;
    }
    this.cache.delete(key);
    this.cache.set(key, block);
    return block;
  }

  private put(key: string, block: Block) {
    const previous = this.cache.get(key);
    if (previous) this.used -= previous.bytes.length;
    this.cache.delete(key);
    this.cache.set(key, block);
    this.used += block.bytes.length;
    while (this.used > this.limit && this.cache.size) {
      const oldest = this.cache.keys().next().value!;
      this.used -= this.cache.get(oldest)!.bytes.length;
      this.cache.delete(oldest);
    }
  }

  private async read(
    url: string,
    headers: Headers,
    key: string,
    index: number,
    signal: AbortSignal,
    speculative = false
  ): Promise<Block> {
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    const blockKey = `${key}:${index}`;
    const cached = this.cached(blockKey);
    if (cached) return cached;
    const existing = this.pending.get(blockKey);
    if (existing) {
      // A foreground audio read can bypass a stalled speculative request.
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const shared = await Promise.race([
          existing.promise.catch(() => undefined),
          new Promise<undefined>((resolve) => {
            timer = setTimeout(() => resolve(undefined), speculative ? 2500 : 150);
          })
        ]);
        if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
        if (shared) return shared;
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(abort, speculative ? 2500 : 8000);
    const promise = (async () => {
      for (let attempt = 0; attempt < (speculative ? 1 : 2); attempt++) {
        try {
          const requestHeaders = new Headers(headers);
          requestHeaders.set(
            'Range',
            `bytes=${index * this.blockSize}-${(index + 1) * this.blockSize - 1}`
          );
          requestHeaders.set('Accept-Encoding', 'identity');
          const response = await this.fetcher(url, {
            headers: requestHeaders,
            signal: controller.signal
          });
          if (response.status === 200) throw new Unranged(response);
          if (response.status !== 206) {
            await response.body?.cancel();
            if ([500, 502, 503, 504].includes(response.status) && !speculative && attempt === 0)
              continue;
            throw new Error(`Media HTTP ${response.status}`);
          }
          const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(
            response.headers.get('content-range') || ''
          );
          if (
            !range ||
            !Number.isSafeInteger(Number(range[3])) ||
            Number(range[1]) !== index * this.blockSize ||
            Number(range[2]) !== Math.min((index + 1) * this.blockSize - 1, Number(range[3]) - 1) ||
            Number(range[2]) < Number(range[1]) ||
            Number(range[2]) >= Number(range[3]) ||
            (response.headers.get('content-encoding') &&
              response.headers.get('content-encoding') !== 'identity')
          ) {
            await response.body?.cancel();
            throw new Error('Invalid media range');
          }
          const reader = response.body?.getReader();
          if (!reader) throw new Error('Missing media body');
          const chunks: Uint8Array[] = [];
          let size = 0;
          for (;;) {
            const part = await reader.read();
            if (part.done) break;
            size += part.value.length;
            if (size > this.blockSize) {
              await reader.cancel();
              throw new Error('Oversized media range');
            }
            chunks.push(part.value);
          }
          const bytes = new Uint8Array(size);
          let offset = 0;
          for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.length;
          }
          if (bytes.length !== Number(range[2]) - Number(range[1]) + 1)
            throw new Error('Truncated media range');
          if (controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
          const result = {
            bytes,
            total: Number(range[3]),
            type: response.headers.get('content-type') || 'audio/mpeg',
            expiry: Date.now() + 5 * 60_000
          };
          this.put(blockKey, result);
          return result;
        } catch (error) {
          if (
            error instanceof Unranged ||
            controller.signal.aborted ||
            speculative ||
            attempt > 0 ||
            /Media HTTP|Invalid media range/.test(String(error))
          )
            throw error;
        }
      }
      throw new Error('Media unavailable');
    })().finally(() => {
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
      if (this.pending.get(blockKey)?.promise === promise) this.pending.delete(blockKey);
    });
    this.pending.set(blockKey, { promise, controller, speculative });
    return promise;
  }

  private ahead(url: string, headers: Headers, key: string, index: number, total: number) {
    if (this.speculative || (index + 1) * this.blockSize >= total) return;
    const revision = this.revision;
    const controller = new AbortController();
    this.speculative = controller;
    void (async () => {
      for (let next = index + 1; next <= index + 2 && next * this.blockSize < total; next++) {
        if (revision !== this.revision) return;
        await this.read(url, headers, key, next, controller.signal, true);
      }
    })()
      .catch(() => {})
      .finally(() => {
        if (this.speculative === controller) this.speculative = undefined;
      });
  }

  async fetch(url: string, options: RequestInit = {}): Promise<Response> {
    const headers = new Headers(options.headers);
    const raw = headers.get('range');
    // Continuous playback must not wait for a whole cache block before first byte.
    // Preserve Range, redirects, backpressure and the caller's cancellation signal.
    if (this.streamPlayback) {
      this.cancelSpeculation();
      return this.fetcher(url, options);
    }
    const range = raw && /^bytes=(\d+)-(\d*)$/.exec(raw);
    if (!range || options.method === 'HEAD' || headers.has('if-range'))
      return this.fetcher(url, options);
    headers.delete('range');
    const key = JSON.stringify([url, [...headers.entries()].sort()]);
    if ((this.unranged.get(key) || 0) > Date.now()) return this.fetcher(url, options);
    const start = Number(range[1]);
    if (!Number.isSafeInteger(start) || (range[2] && !Number.isSafeInteger(Number(range[2]))))
      return this.fetcher(url, options);
    if (
      this.plan?.key !== key ||
      Math.abs(start - this.plan.first) > 2 * this.blockSize ||
      start < this.plan.first
    )
      this.cancelSpeculation();
    this.plan = { key, first: start };
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (options.signal?.aborted) abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    const cleanup = () => options.signal?.removeEventListener('abort', abort);
    let first: Block;
    try {
      first = await this.read(
        url,
        headers,
        key,
        Math.floor(start / this.blockSize),
        controller.signal
      );
    } catch (error) {
      cleanup();
      if (error instanceof Unranged) {
        await error.response.body?.cancel();
        this.unranged.set(key, Date.now() + 60_000);
        if (this.unranged.size > 64) this.unranged.delete(this.unranged.keys().next().value!);
        return this.fetcher(url, options);
      }
      throw error;
    }
    const end = range[2] ? Math.min(Number(range[2]), first.total - 1) : first.total - 1;
    if (start > end) {
      cleanup();
      return new Response(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${first.total}` }
      });
    }
    let cursor = start;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull: async (target) => {
          try {
            const index = Math.floor(cursor / this.blockSize);
            const block =
              index === Math.floor(start / this.blockSize)
                ? first
                : await this.read(url, headers, key, index, controller.signal);
            if (controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
            if (block.total !== first.total) throw new Error('Media changed during playback');
            const offset = cursor - index * this.blockSize;
            const bytes = block.bytes.subarray(
              offset,
              Math.min(block.bytes.length, end - index * this.blockSize + 1)
            );
            if (!bytes.length) throw new Error('Truncated media');
            cursor += bytes.length;
            target.enqueue(bytes);
            this.ahead(url, headers, key, index, first.total);
            if (cursor > end) {
              cleanup();
              target.close();
            }
          } catch (error) {
            cleanup();
            target.error(error);
            controller.abort();
          }
        },
        cancel: () => {
          cleanup();
          controller.abort();
          this.cancelSpeculation();
        }
      },
      { highWaterMark: 1 }
    );
    return new Response(stream, {
      status: 206,
      headers: {
        'Content-Type': first.type,
        'Content-Length': String(end - start + 1),
        'Content-Range': `bytes ${start}-${end}/${first.total}`,
        'Accept-Ranges': 'bytes'
      }
    });
  }
}
