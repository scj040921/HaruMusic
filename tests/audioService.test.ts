import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SongResult } from '@/types/music';

vi.mock('@/utils', () => ({
  isElectron: false,
  isAndroidApp: false,
  getImgUrl: (url: string) => url
}));

class TestAudio extends EventTarget {
  static instances: TestAudio[] = [];

  src = '';
  currentTime = 0;
  duration = 180;
  paused = true;
  ended = false;
  error: { code: number; message: string } | null = null;
  readyState = 0;
  muted = false;
  volume = 1;
  preload = 'auto';
  crossOrigin = '';
  load = vi.fn();
  play = vi.fn(async () => {
    this.paused = false;
  });
  pause = vi.fn(() => {
    this.paused = true;
  });

  constructor() {
    super();
    TestAudio.instances.push(this);
  }

  removeAttribute(name: string): void {
    if (name === 'src') this.src = '';
  }

  fail(code = 2): void {
    this.error = { code, message: 'Test media error' };
    this.dispatchEvent(new Event('error'));
  }

  ready(): void {
    this.error = null;
    this.readyState = 2;
    this.dispatchEvent(new Event('canplay'));
  }
}

const makeSong = (id: string | number, url: string): SongResult =>
  ({
    id,
    name: String(id),
    source: 'netease',
    playMusicUrl: url,
    picUrl: '',
    ar: [],
    al: { name: '' }
  }) as SongResult;

describe('audio loading ownership (#769)', () => {
  let service: (typeof import('@/services/audioService'))['audioService'];
  let audio: TestAudio;

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    TestAudio.instances = [];
    vi.stubGlobal('Audio', TestAudio);
    vi.stubGlobal('MediaError', { MEDIA_ERR_SRC_NOT_SUPPORTED: 4 });
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('document', { baseURI: 'https://app.local/' });
    vi.stubGlobal('HTMLMediaElement', { HAVE_NOTHING: 0, HAVE_CURRENT_DATA: 2 });
    vi.stubGlobal('window', { addEventListener: vi.fn() });
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
    service = (await import('@/services/audioService')).audioService;
    audio = TestAudio.instances[0];
  });

  afterEach(() => {
    service.stop();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('forwards native media time without timer interpolation', () => {
    const listener = vi.fn();
    service.on('timeupdate', listener);
    audio.currentTime = 42.75;
    audio.dispatchEvent(new Event('timeupdate'));
    expect(listener).toHaveBeenCalledWith(42.75);
    vi.advanceTimersByTime(1000);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('cancels a scheduled online retry when a local song starts', async () => {
    const remote = makeSong(1, 'https://example.com/old.mp3');
    const local = makeSong('local-song', 'local:////Music/current.mp3');
    let cancelled: Error | undefined;
    void service.play(remote.playMusicUrl!, remote).catch((error) => {
      cancelled = error;
    });
    audio.fail();

    service.stop();
    const playback = service.play(local.playMusicUrl!, local);
    audio.ready();
    await playback;
    await vi.advanceTimersByTimeAsync(2000);

    expect(audio.src).toBe(local.playMusicUrl);
    expect(service.getCurrentTrack()?.id).toBe(local.id);
    expect(cancelled?.name).toBe('AbortError');
  });

  it('settles a cancelled load without letting its listeners play the next song', async () => {
    const first = makeSong(1, 'https://example.com/first.mp3');
    const second = makeSong(2, 'https://example.com/second.mp3');
    let cancelled: Error | undefined;
    void service.play(first.playMusicUrl!, first).catch((error) => {
      cancelled = error;
    });

    const playback = service.play(second.playMusicUrl!, second);
    audio.ready();
    await playback;
    await Promise.resolve();

    expect(cancelled?.name).toBe('AbortError');
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(service.getCurrentTrack()?.id).toBe(second.id);
  });

  it('cancels retries on stop even when no replacement song is played', async () => {
    const song = makeSong(1, 'https://example.com/song.mp3');
    void service.play(song.playMusicUrl!, song).catch(() => {});
    audio.fail();
    service.stop();
    await vi.advanceTimersByTimeAsync(2000);

    expect(audio.src).toBe('');
    expect(service.getCurrentTrack()).toBeNull();
    expect(service.isLoading()).toBe(false);
  });

  it('never asks online parsers to replace a failed local file', async () => {
    const song = makeSong('123abc', 'local:////Music/missing.mp3');
    const expired = vi.fn();
    service.on('url_expired', expired);
    const playback = service.play(song.playMusicUrl!, song).catch((error) => error);
    audio.fail(4);

    expect(await playback).toBeInstanceOf(Error);
    expect(expired).not.toHaveBeenCalled();
    expect(audio.src).toBe(song.playMusicUrl);
  });

  it('still retries a transient failure of the current online song', async () => {
    const song = makeSong(1, 'https://example.com/song.mp3');
    const playback = service.play(song.playMusicUrl!, song);
    audio.fail();
    await vi.advanceTimersByTimeAsync(1000);
    audio.ready();

    await expect(playback).resolves.toBe(audio);
    expect(audio.load).toHaveBeenCalledTimes(2);
    expect(audio.play).toHaveBeenCalledTimes(1);
  });

  it('hands an invalid online source back to the caller without an in-band refresh', async () => {
    const song = makeSong(1, 'https://example.com/expired.mp3');
    const expired = vi.fn();
    service.on('url_expired', expired);
    const playback = service.play(song.playMusicUrl!, song).catch((error) => error);
    audio.fail(4);

    expect(await playback).toBeInstanceOf(Error);
    // code 4 的源本身无效，用同一 URL 重试没有意义，加载只应发生一次
    expect(audio.load).toHaveBeenCalledTimes(1);
    // 加载期间的失败由 playTrack 清缓存后重解析，此处不发 url_expired 抢占播放
    expect(expired).not.toHaveBeenCalled();
  });

  it('refreshes the URL when an online source goes invalid after loading', async () => {
    const song = makeSong(1, 'https://example.com/live.mp3');
    const expired = vi.fn();
    service.on('url_expired', expired);
    const playback = service.play(song.playMusicUrl!, song);
    audio.ready();
    await playback;

    audio.fail(4);

    expect(expired).toHaveBeenCalledExactlyOnceWith(song);
  });

  it('cancels autoplay when paused before the source becomes ready', async () => {
    const song = makeSong(1, 'https://example.com/slow.mp3');
    const playback = service.play(song.playMusicUrl!, song).catch((error) => error);
    service.pause();
    audio.ready();
    await vi.advanceTimersByTimeAsync(20000);

    expect(audio.play).not.toHaveBeenCalled();
    expect((await playback).name).toBe('AbortError');
    expect(service.isLoading()).toBe(false);
  });

  it('rejects playback when the browser refuses to play', async () => {
    const song = makeSong(1, 'https://example.com/song.mp3');
    const error = new DOMException('Autoplay blocked', 'NotAllowedError');
    audio.play.mockRejectedValueOnce(error);
    const playback = service.play(song.playMusicUrl!, song).catch((reason) => reason);
    audio.ready();

    expect(await playback).toBe(error);
    expect(service.isActuallyPlaying()).toBe(false);
  });

  it('times out a source that never emits canplay or error', async () => {
    const song = makeSong(1, 'https://example.com/stalled.mp3');
    let failure: Error | undefined;
    void service.play(song.playMusicUrl!, song).catch((error) => {
      failure = error;
    });
    await vi.advanceTimersByTimeAsync(60000);

    expect(failure).toBeInstanceOf(Error);
    expect(service.isLoading()).toBe(false);
  });

  it('supports an explicit seek to zero when replaying the same URL', async () => {
    const song = makeSong(1, 'https://example.com/song.mp3');
    const first = service.play(song.playMusicUrl!, song);
    audio.ready();
    await first;
    audio.currentTime = 179;

    await service.play(song.playMusicUrl!, song, true, 0);
    expect(audio.currentTime).toBe(0);
  });

  it('adopts a prebuffered audio element for the next track', async () => {
    const song = makeSong(2, 'https://example.com/next.mp3');
    const preloaded = new TestAudio();
    preloaded.src = song.playMusicUrl!;
    preloaded.readyState = 2;

    const playback = service.play(song.playMusicUrl!, song, true, 0, preloaded as any);
    await expect(playback).resolves.toBe(preloaded);

    expect(service.getCurrentSound()).toBe(preloaded);
    expect(service.getCurrentTrack()?.id).toBe(song.id);
    expect(audio.pause).toHaveBeenCalledOnce();
    expect(preloaded.play).toHaveBeenCalledOnce();
  });

  it('keeps the current song audible until a replacement source is ready', async () => {
    const current = makeSong(1, 'https://example.com/current.mp3');
    const next = makeSong(2, 'https://example.com/next.mp3');
    const initial = service.play(current.playMusicUrl!, current);
    audio.ready();
    await initial;
    audio.currentTime = 51;

    const pendingNext = service.play(next.playMusicUrl!, next).catch((error) => error);
    const staged = TestAudio.instances[1];
    expect(service.getCurrentSound()).toBe(audio);
    expect(audio.paused).toBe(false);
    expect(audio.currentTime).toBe(51);

    staged.fail(4);
    expect(await pendingNext).toBeInstanceOf(Error);
    expect(service.getCurrentSound()).toBe(audio);
    expect(service.getCurrentTrack()).toBe(current);
    expect(audio.paused).toBe(false);
    expect(audio.currentTime).toBe(51);
  });

  it('restores the previous song if a ready preloaded element cannot start', async () => {
    const current = makeSong(1, 'https://example.com/current.mp3');
    const next = makeSong(2, 'https://example.com/next.mp3');
    const initial = service.play(current.playMusicUrl!, current);
    audio.ready();
    await initial;
    audio.currentTime = 51;

    const preloaded = new TestAudio();
    preloaded.src = next.playMusicUrl!;
    preloaded.readyState = 2;
    preloaded.play.mockRejectedValueOnce(new DOMException('Blocked', 'NotAllowedError'));
    const failed = service
      .play(next.playMusicUrl!, next, true, 0, preloaded as any)
      .catch((e) => e);

    expect(await failed).toBeInstanceOf(DOMException);
    expect(service.getCurrentSound()).toBe(audio);
    expect(service.getCurrentTrack()).toBe(current);
    expect(audio.currentTime).toBe(51);
    expect(audio.play).toHaveBeenCalledTimes(2);
  });

  it('cancels the old load before adopting a prebuffered element', async () => {
    const oldSong = makeSong(1, 'https://example.com/old.mp3');
    const nextSong = makeSong(2, 'https://example.com/next.mp3');
    let cancelled: Error | undefined;
    void service.play(oldSong.playMusicUrl!, oldSong).catch((error) => {
      cancelled = error;
    });
    const preloaded = new TestAudio();
    preloaded.src = nextSong.playMusicUrl!;
    preloaded.readyState = 2;
    await service.play(nextSong.playMusicUrl!, nextSong, true, 0, preloaded as any);
    audio.ready();
    await Promise.resolve();
    expect(cancelled?.name).toBe('AbortError');
    expect(preloaded.play).toHaveBeenCalledOnce();
    expect(service.getCurrentTrack()?.id).toBe(nextSong.id);
  });

  it('starts on the first decoded frame without waiting for canplay', async () => {
    const song = makeSong(1, 'https://example.com/song.mp3');
    const playback = service.play(song.playMusicUrl!, song);
    audio.readyState = 2;
    audio.dispatchEvent(new Event('loadeddata'));
    await playback;
    expect(audio.play).toHaveBeenCalledOnce();
  });

  it('clamps seek targets and ignores non-finite values', async () => {
    const song = makeSong(1, 'https://example.com/song.mp3');
    const playback = service.play(song.playMusicUrl!, song);
    audio.ready();
    await playback;

    service.seek(999);
    expect(audio.currentTime).toBe(audio.duration);
    service.seek(Number.NaN);
    expect(audio.currentTime).toBe(audio.duration);
    service.seek(-10);
    expect(audio.currentTime).toBe(0);
  });
  it('shares one load deadline across an internal network retry', async () => {
    const song = makeSong(1, 'https://example.com/slow.mp3');
    const result = service
      .play(song.playMusicUrl!, song, true, undefined, undefined, { deadline: Date.now() + 1000 })
      .catch((e) => e);
    await vi.advanceTimersByTimeAsync(500);
    audio.fail(2);
    await vi.advanceTimersByTimeAsync(501);
    expect((await result).name).toBe('AudioLoadTimeout');
    expect(service.isLoading()).toBe(false);
  });
  it('cancels a pending next-track load immediately when its request is aborted', async () => {
    const first = makeSong(1, 'https://example.com/first.mp3');
    const initial = service.play(first.playMusicUrl!, first);
    audio.ready();
    await initial;
    const next = makeSong(2, 'https://example.com/next.mp3');
    const controller = new AbortController();
    const pending = service
      .play(next.playMusicUrl!, next, true, undefined, undefined, { signal: controller.signal })
      .catch((e) => e);
    controller.abort();
    expect((await pending).name).toBe('AbortError');
    expect(service.getCurrentTrack()?.id).toBe(first.id);
    expect(service.isLoading()).toBe(false);
  });
});
