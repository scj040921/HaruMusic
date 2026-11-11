import type { SongResult } from '@/types/music';

/**
 * Preloads the next track into a muted HTMLAudioElement. When that track is
 * selected, AudioService can adopt the already-buffered element instead of
 * waiting for the same URL to become playable a second time.
 */
class PreloadService {
  private validatedUrls = new Map<string | number, string>();
  private loadingPromises = new Map<string | number, Promise<string>>();
  private preloadedSounds = new Map<string | number, HTMLAudioElement>();
  private static readonly MAX_VALIDATED_URLS = 100;
  private static readonly MAX_PRELOADED_SOUNDS = 2;

  public async load(song: SongResult): Promise<string> {
    if (!song?.id) throw new Error('无效的歌曲对象');
    if (!song.playMusicUrl) throw new Error('歌曲没有 URL');

    if (
      this.validatedUrls.get(song.id) === song.playMusicUrl &&
      this.preloadedSounds.has(song.id)
    ) {
      return song.playMusicUrl;
    }
    const pending = this.loadingPromises.get(song.id);
    if (pending) return pending;

    const promise = this.warmAudio(song.playMusicUrl, song)
      .then((url) => {
        this.validatedUrls.delete(song.id);
        this.validatedUrls.set(song.id, url);
        while (this.validatedUrls.size > PreloadService.MAX_VALIDATED_URLS) {
          const oldest = this.validatedUrls.keys().next().value;
          if (oldest === undefined) break;
          this.validatedUrls.delete(oldest);
        }
        return url;
      })
      .finally(() => this.loadingPromises.delete(song.id));
    this.loadingPromises.set(song.id, promise);
    return promise;
  }

  private warmAudio(url: string, song: SongResult): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const audio = new Audio();
      audio.crossOrigin = 'anonymous';
      audio.preload = 'auto';
      audio.muted = true;
      audio.volume = 0;
      this.preloadedSounds.set(song.id, audio);
      while (this.preloadedSounds.size > PreloadService.MAX_PRELOADED_SOUNDS) {
        const oldest = this.preloadedSounds.keys().next().value;
        if (oldest === undefined) break;
        this.disposeSound(this.preloadedSounds.get(oldest));
        this.preloadedSounds.delete(oldest);
      }

      let settled = false;
      const timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        if (audio.readyState === HTMLMediaElement.HAVE_NOTHING) {
          if (this.preloadedSounds.get(song.id) === audio) this.preloadedSounds.delete(song.id);
          this.disposeSound(audio);
        }
        resolve(url);
      }, 5000);
      const cleanup = () => {
        clearTimeout(timeoutId);
        audio.removeEventListener('loadedmetadata', onLoaded);
        audio.removeEventListener('canplay', onLoaded);
        audio.removeEventListener('error', onError);
      };
      const finishLoaded = () => {
        if (settled) return;
        settled = true;
        cleanup();
        this.checkDuration(audio, song);
        resolve(url);
      };
      const onLoaded = () => finishLoaded();
      const onError = () => {
        if (settled) return;
        settled = true;
        cleanup();
        if (this.preloadedSounds.get(song.id) === audio) {
          this.preloadedSounds.delete(song.id);
        }
        this.disposeSound(audio);
        reject(new Error(`URL 验证失败: ${song.name}`));
      };

      audio.addEventListener('loadedmetadata', onLoaded);
      audio.addEventListener('canplay', onLoaded);
      audio.addEventListener('error', onError);
      audio.src = url;
      audio.load();
      // Some hosts throttle preload=auto. Keep the normal URL path available
      // instead of making a slow warmup block playlist navigation.
    });
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
      // The browser can discard a warm media resource while the queue changes.
    }
  }

  /** Wait briefly for a queued warmup, then transfer only a ready audio node. */
  public async consumeSound(
    songId: string | number,
    url: string,
    waitMs = 900
  ): Promise<HTMLAudioElement | undefined> {
    const isSameUrl = (audio: HTMLAudioElement) => {
      try {
        return audio.src === new URL(url, document.baseURI).href;
      } catch {
        return audio.src === url;
      }
    };
    let audio = this.preloadedSounds.get(songId);
    if (audio && isSameUrl(audio) && audio.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      await new Promise<void>((resolve) => {
        const finish = () => {
          clearTimeout(timeoutId);
          audio!.removeEventListener('canplay', finish);
          audio!.removeEventListener('error', finish);
          resolve();
        };
        audio!.addEventListener('canplay', finish, { once: true });
        audio!.addEventListener('error', finish, { once: true });
        const timeoutId = setTimeout(finish, waitMs);
      });
      audio = this.preloadedSounds.get(songId);
    }

    if (
      !audio ||
      !isSameUrl(audio) ||
      audio.error ||
      audio.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
    ) {
      return undefined;
    }

    this.preloadedSounds.delete(songId);
    this.validatedUrls.delete(songId);
    audio.muted = false;
    return audio;
  }

  /** Remove a cached URL and release a warm decoder/buffer. */
  public cancel(songId: string | number): void {
    this.validatedUrls.delete(songId);
    this.disposeSound(this.preloadedSounds.get(songId));
    this.preloadedSounds.delete(songId);
  }

  public consume(songId: string | number): string | undefined {
    const url = this.validatedUrls.get(songId);
    if (!url) return undefined;
    this.validatedUrls.delete(songId);
    return url;
  }

  public getPreloadedSound(songId: string | number): string | undefined {
    return this.validatedUrls.get(songId);
  }

  public clearAll(): void {
    this.validatedUrls.clear();
    this.loadingPromises.clear();
    for (const sound of this.preloadedSounds.values()) this.disposeSound(sound);
    this.preloadedSounds.clear();
  }
}

export const preloadService = new PreloadService();
