import type { SongResult } from '@/types/music';

type PreloadEntry = {
  key: string;
  url: string;
  audio: HTMLAudioElement;
  promise: Promise<string>;
  settled: boolean;
  ready: boolean;
  cancel: () => void;
};

/**
 * Keeps at most two isolated warm audio elements. Entries are keyed by both
 * source and song ID, and an URL change cancels the previous warmup before a
 * new one can take ownership of the cache slot.
 */
class PreloadService {
  private entries = new Map<string, PreloadEntry>();
  private revision = 0;
  private static readonly MAX_PRELOADED_SOUNDS = 2;
  private static readonly WARMUP_TIMEOUT_MS = 5000;

  private key(song: Pick<SongResult, 'id' | 'source'>): string {
    return `${song.source || 'unknown'}:${typeof song.id}:${String(song.id)}`;
  }

  public getRevision(): number {
    return this.revision;
  }

  public async load(song: SongResult, expectedRevision = this.revision): Promise<string> {
    if (!song?.id) throw new Error('无效的歌曲对象');
    if (!song.playMusicUrl) throw new Error('歌曲没有 URL');
    if (expectedRevision !== this.revision) return song.playMusicUrl;

    const key = this.key(song);
    const existing = this.entries.get(key);
    if (existing?.url === song.playMusicUrl) return existing.promise;
    if (existing) existing.cancel();

    let audio: HTMLAudioElement;
    try {
      audio = new Audio();
    } catch {
      return song.playMusicUrl;
    }

    audio.crossOrigin = 'anonymous';
    audio.preload = 'auto';
    audio.muted = true;
    audio.volume = 0;

    let resolvePromise!: (url: string) => void;
    const promise = new Promise<string>((resolve) => {
      resolvePromise = resolve;
    });
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = null;
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('error', onError);
    };
    const entry: PreloadEntry = {
      key,
      url: song.playMusicUrl,
      audio,
      promise,
      settled: false,
      ready: false,
      cancel: () => {
        const shouldResolve = !settled;
        settled = true;
        entry.settled = true;
        cleanup();
        if (this.entries.get(key) === entry) this.entries.delete(key);
        this.disposeSound(audio);
        if (shouldResolve) resolvePromise(song.playMusicUrl!);
      }
    };

    const finishUnavailable = () => {
      if (settled) return;
      settled = true;
      entry.settled = true;
      cleanup();
      if (this.entries.get(key) === entry) this.entries.delete(key);
      this.disposeSound(audio);
      resolvePromise(song.playMusicUrl!);
    };
    const onLoadedMetadata = () => this.checkDuration(audio, song);
    const onCanPlay = () => {
      if (settled) return;
      settled = true;
      entry.settled = true;
      entry.ready = audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && !audio.error;
      cleanup();
      if (!entry.ready || this.entries.get(key) !== entry) {
        if (this.entries.get(key) === entry) this.entries.delete(key);
        this.disposeSound(audio);
      } else {
        this.checkDuration(audio, song);
      }
      resolvePromise(song.playMusicUrl!);
    };
    const onError = () => finishUnavailable();

    this.entries.set(key, entry);
    while (this.entries.size > PreloadService.MAX_PRELOADED_SOUNDS) {
      const oldestKey = this.entries.keys().next().value;
      if (!oldestKey || oldestKey === key) break;
      this.entries.get(oldestKey)?.cancel();
    }

    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('error', onError);
    timeoutId = setTimeout(() => {
      if (audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && !audio.error) {
        onCanPlay();
      } else {
        finishUnavailable();
      }
    }, PreloadService.WARMUP_TIMEOUT_MS);
    try {
      audio.src = song.playMusicUrl;
      audio.load();
    } catch {
      finishUnavailable();
    }
    return promise;
  }

  private checkDuration(audio: HTMLAudioElement, song: SongResult): void {
    const duration = audio.duration;
    const expectedDuration = (song.dt || 0) / 1000;
    if (!expectedDuration || !duration || !Number.isFinite(duration)) return;
    const durationDiff = Math.abs(duration - expectedDuration);
    if (duration < expectedDuration * 0.5 && durationDiff > 10) {
      console.warn(
        `[PreloadService] 时长严重不足：实际 ${duration.toFixed(1)}s, 预期 ${expectedDuration.toFixed(1)}s (${song.name})，可能是试听版`
      );
      window.dispatchEvent(
        new CustomEvent('audio-duration-mismatch', {
          detail: {
            songId: song.id,
            songName: song.name,
            actualDuration: duration,
            expectedDuration
          }
        })
      );
    }
  }

  private disposeSound(sound?: HTMLAudioElement): void {
    if (!sound) return;
    try {
      sound.pause();
      sound.removeAttribute('src');
      sound.load();
    } catch {
      // The browser may have already discarded the warm media resource.
    }
  }

  /** Transfer only a ready element that still belongs to this exact source. */
  public async consumeSound(
    song: Pick<SongResult, 'id' | 'source'>,
    url: string,
    waitMs = 0
  ): Promise<HTMLAudioElement | undefined> {
    const key = this.key(song);
    let entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.url !== url) {
      entry.cancel();
      return undefined;
    }

    if (!entry.ready && !entry.settled && waitMs > 0) {
      const candidate = entry.audio;
      await new Promise<void>((resolve) => {
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          clearTimeout(timeoutId);
          candidate.removeEventListener('canplay', finish);
          candidate.removeEventListener('error', finish);
          resolve();
        };
        const timeoutId = setTimeout(finish, waitMs);
        candidate.addEventListener('canplay', finish, { once: true });
        candidate.addEventListener('error', finish, { once: true });
      });
      entry = this.entries.get(key);
    }

    if (
      !entry ||
      entry.url !== url ||
      !entry.ready ||
      entry.audio.error ||
      entry.audio.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
    ) {
      entry?.cancel();
      return undefined;
    }

    this.entries.delete(key);
    entry.audio.muted = false;
    entry.audio.volume = 1;
    return entry.audio;
  }

  /** Remove stale URLs for one source/song pair, or all matching IDs. */
  public cancel(songId: string | number, source?: string): void {
    const idPart = `${typeof songId}:${String(songId)}`;
    for (const [key, entry] of this.entries) {
      if (key.endsWith(`:${idPart}`) && (!source || key.startsWith(`${source}:`))) {
        entry.cancel();
      }
    }
  }

  /** Keep the selected track's warm element and release stale queue work. */
  public retain(song: Pick<SongResult, 'id' | 'source'>): void {
    this.revision++;
    const keepKey = this.key(song);
    for (const [key, entry] of this.entries) {
      if (key !== keepKey) entry.cancel();
    }
  }

  public consume(songId: string | number, source?: string): string | undefined {
    for (const [key, entry] of this.entries) {
      if (
        key.endsWith(`:${typeof songId}:${String(songId)}`) &&
        (!source || key.startsWith(`${source}:`)) &&
        entry.ready
      ) {
        const url = entry.url;
        entry.cancel();
        return url;
      }
    }
    return undefined;
  }

  public getPreloadedSound(songId: string | number, source?: string): string | undefined {
    for (const [key, entry] of this.entries) {
      if (
        key.endsWith(`:${typeof songId}:${String(songId)}`) &&
        (!source || key.startsWith(`${source}:`)) &&
        entry.ready
      ) {
        return entry.url;
      }
    }
    return undefined;
  }

  public clearAll(): void {
    this.revision++;
    for (const entry of [...this.entries.values()]) entry.cancel();
    this.entries.clear();
  }
}

export const preloadService = new PreloadService();
