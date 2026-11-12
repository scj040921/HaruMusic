import { registerPlugin } from '@capacitor/core';

import type { AudioOutputDevice } from '@/types/audio';
import type { SongResult } from '@/types/music';
import { getImgUrl, isAndroidApp, isElectron } from '@/utils';

const androidMedia = isAndroidApp
  ? registerPlugin<{
      update(options: {
        title: string;
        artist: string;
        album: string;
        artwork: string;
        position: number;
        duration: number;
        playing: boolean;
      }): Promise<void>;
      addListener(
        event: 'mediaAction',
        listener: (event: { action: string; position: number }) => void
      ): Promise<unknown>;
    }>('HaruMedia')
  : null;

class AudioService {
  private audio: HTMLAudioElement;
  private currentTrack: SongResult | null = null;

  private context: AudioContext | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private sourceNodes = new Map<HTMLAudioElement, MediaElementAudioSourceNode>();
  private audioEventCleanup: (() => void) | null = null;
  private filters: BiquadFilterNode[] = [];
  private gainNode: GainNode | null = null;
  private bypass = false;

  private playbackRate = 1.0;
  private volume = 1;
  private currentSinkId: string = 'default';
  private _isLoading = false;
  private nativeMediaStarted = false;

  private operationLock = false;
  private operationLockTimer: ReturnType<typeof setTimeout> | null = null;

  // 取消整轮加载（包括重试等待），并结算旧 Promise，防止旧歌曲抢回共享 audio。
  private pendingLoadCleanup: (() => void) | null = null;
  private stallTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly frequencies = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

  private defaultEQSettings: { [key: string]: number } = {
    '31': 0,
    '62': 0,
    '125': 0,
    '250': 0,
    '500': 0,
    '1000': 0,
    '2000': 0,
    '4000': 0,
    '8000': 0,
    '16000': 0
  };

  // Event system
  private callbacks: { [key: string]: Function[] } = {};

  constructor() {
    // Create persistent audio element
    this.audio = new Audio();
    this.audio.crossOrigin = 'anonymous';
    this.audio.preload = 'auto';

    // Bind native DOM events
    this.bindAudioEvents();

    if (androidMedia) {
      void androidMedia.addListener('mediaAction', ({ action, position }) => {
        if (action === 'play') this.emit('play_request');
        else if (action === 'pause') this.emit('pause_request');
        else if (action === 'next') this.emit('nexttrack');
        else if (action === 'previous') this.emit('previoustrack');
        else if (action === 'seek') this.seek(position);
      });
    }

    if ('mediaSession' in navigator) {
      this.initMediaSession();
    }

    // Restore EQ bypass state
    try {
      this.bypass = JSON.parse(localStorage.getItem('eqBypass') || 'false') === true;
    } catch {
      this.bypass = false;
    }
    const volume = Number(localStorage.getItem('volume') ?? 1);
    this.volume = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 1;

    this.forceResetOperationLock();
    window.addEventListener('beforeunload', () => this.forceResetOperationLock());
  }

  // ==================== Native DOM Event Binding ====================

  private bindAudioEvents() {
    this.audioEventCleanup?.();
    if (this.stallTimer) clearTimeout(this.stallTimer);
    this.stallTimer = null;
    const audio = this.audio;
    const isCurrent = () => this.audio === audio;
    const clearStallTimer = () => {
      if (this.stallTimer) clearTimeout(this.stallTimer);
      this.stallTimer = null;
    };
    const armStallTimer = () => {
      if (!isCurrent() || audio.paused || this.pendingLoadCleanup || !this.currentTrack) return;
      clearStallTimer();
      this._isLoading = true;
      this.stallTimer = setTimeout(() => {
        this.stallTimer = null;
        if (!isCurrent() || audio.paused || this.pendingLoadCleanup || !this.currentTrack) return;
        this._isLoading = false;
        this.updateMediaSessionState(false);
        this.emit(
          this.currentTrack.source === 'local' ? 'playback_error' : 'url_expired',
          this.currentTrack
        );
      }, 15000);
    };
    const onPlay = () => {
      if (!isCurrent() || audio.paused || !this.currentTrack) return;
      this.updateMediaSessionState(true);
      this.emit('play');
    };

    const onPause = () => {
      if (!isCurrent() || !audio.paused) return;
      this.updateMediaSessionState(false);
      this.emit('pause');
    };

    const onEnded = () => {
      if (!isCurrent() || !audio.ended || !this.currentTrack) return;
      this.updateMediaSessionState(false);
      this.emit('end', this.currentTrack);
    };

    const onSeeked = () => {
      if (!isCurrent()) return;
      this.updateMediaSessionPositionState();
      this.emit('seek');
    };

    const onTimeUpdate = () => {
      if (!isCurrent()) return;
      clearStallTimer();
      if (!this.pendingLoadCleanup) this._isLoading = false;
      this.emit('timeupdate', audio.currentTime);
    };

    const onWaiting = () => {
      armStallTimer();
    };

    const onPlaying = () => {
      if (!isCurrent()) return;
      clearStallTimer();
      if (!this.pendingLoadCleanup) this._isLoading = false;
    };

    const onCanPlay = () => {
      if (!isCurrent()) return;
      clearStallTimer();
      if (!this.pendingLoadCleanup) this._isLoading = false;
    };

    const onError = () => {
      if (!isCurrent()) return;
      const error = audio.error;
      console.error('Audio element error:', error?.code, error?.message);
      this.emit('audio_error', { type: 'media_error', error });
      if (!this.pendingLoadCleanup && this.currentTrack) {
        this._isLoading = false;
        this.updateMediaSessionState(false);
        this.emit(
          this.currentTrack.source === 'local' ? 'playback_error' : 'url_expired',
          this.currentTrack
        );
      }
    };

    const listeners: Array<[string, EventListener]> = [
      ['play', onPlay],
      ['pause', onPause],
      ['ended', onEnded],
      ['seeked', onSeeked],
      ['timeupdate', onTimeUpdate],
      ['waiting', onWaiting],
      ['stalled', armStallTimer],
      ['playing', onPlaying],
      ['canplay', onCanPlay],
      ['error', onError]
    ];
    for (const [name, listener] of listeners) audio.addEventListener(name, listener);
    this.audioEventCleanup = () => {
      clearStallTimer();
      for (const [name, listener] of listeners) audio.removeEventListener(name, listener);
    };
  }

  /** Make a warmed/staged element active while keeping the previous one recoverable. */
  private activateAudioElement(audio: HTMLAudioElement): HTMLAudioElement {
    const previous = this.audio;
    if (audio === previous) return previous;
    this.audioEventCleanup?.();
    this.audioEventCleanup = null;
    try {
      previous.pause();
    } catch {
      // The outgoing element may already have ended.
    }
    this.audio = audio;
    this.audio.muted = false;
    this.bindAudioEvents();
    return previous;
  }

  private disposeAudioElement(audio: HTMLAudioElement): void {
    const node = this.sourceNodes.get(audio);
    node?.disconnect();
    this.sourceNodes.delete(audio);
    try {
      if (!audio.paused) audio.pause();
      audio.removeAttribute('src');
      audio.load();
    } catch {
      // Ignore cleanup failures from a browser-discarded resource.
    }
  }

  // ==================== MediaSession ====================

  private initMediaSession() {
    navigator.mediaSession.setActionHandler('play', () => {
      this.emit('play_request');
    });

    navigator.mediaSession.setActionHandler('pause', () => {
      this.emit('pause_request');
    });

    navigator.mediaSession.setActionHandler('stop', () => {
      this.emit('stop_request');
    });

    navigator.mediaSession.setActionHandler('seekto', (event) => {
      if (event.seekTime !== undefined) {
        this.seek(event.seekTime);
      }
    });

    navigator.mediaSession.setActionHandler('seekbackward', (event) => {
      this.seek(this.audio.currentTime - (event.seekOffset || 10));
    });

    navigator.mediaSession.setActionHandler('seekforward', (event) => {
      this.seek(this.audio.currentTime + (event.seekOffset || 10));
    });

    navigator.mediaSession.setActionHandler('previoustrack', () => {
      this.emit('previoustrack');
    });

    navigator.mediaSession.setActionHandler('nexttrack', () => {
      this.emit('nexttrack');
    });
  }

  private updateMediaSessionMetadata(track: SongResult) {
    this.syncAndroidMedia();
    try {
      if (!('mediaSession' in navigator)) return;

      const artists = track.ar
        ? track.ar.map((a) => a.name)
        : track.song?.artists?.map((a) => a.name);
      const album = track.al ? track.al.name : track.song?.album?.name;
      // 上限提到 1024 提升 SMTC/AMLL 等系统媒体控件的封面清晰度（#595）；
      // 走 getImgUrl 以正确处理 data:/local:// 封面与已带参数的 URL
      const artwork = ['96', '128', '192', '256', '384', '512', '1024'].map((size) => ({
        src: getImgUrl(track.picUrl, `${size}y${size}`),
        type: 'image/jpg',
        sizes: `${size}x${size}`
      }));

      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: track.name || '',
        artist: artists ? artists.join(',') : '',
        album: album || '',
        artwork
      });
    } catch (error) {
      console.error('更新媒体会话元数据时出错:', error);
    }
  }

  private updateMediaSessionState(isPlaying: boolean) {
    if (isPlaying) this.nativeMediaStarted = true;
    this.syncAndroidMedia();
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    this.updateMediaSessionPositionState();
  }

  private updateMediaSessionPositionState() {
    this.syncAndroidMedia();
    try {
      if (!('mediaSession' in navigator)) return;
      if (!this.audio.duration || !isFinite(this.audio.duration)) return;

      if ('setPositionState' in navigator.mediaSession) {
        navigator.mediaSession.setPositionState({
          duration: this.audio.duration,
          playbackRate: this.playbackRate,
          position: this.audio.currentTime
        });
      }
    } catch (error) {
      console.error('更新媒体会话位置状态时出错:', error);
    }
  }

  private syncAndroidMedia() {
    if (!androidMedia || !this.nativeMediaStarted || !this.currentTrack) return;
    const track = this.currentTrack;
    const artists = track.ar || track.song?.artists || [];
    void androidMedia
      .update({
        title: track.name || '',
        artist: artists.map((artist: { name?: string }) => artist.name || '').join(' / '),
        album: track.al?.name || track.song?.album?.name || '',
        artwork: getImgUrl(track.picUrl, '512y512'),
        position: Number.isFinite(this.audio.currentTime) ? this.audio.currentTime : 0,
        duration: Number.isFinite(this.audio.duration) ? this.audio.duration : 0,
        playing: !this.audio.paused && !this.audio.ended
      })
      .catch((error) => console.warn('[Android media]', error));
  }

  // ==================== Event Emitter ====================

  private emit(event: string, ...args: any[]) {
    const eventCallbacks = this.callbacks[event];
    if (eventCallbacks) {
      eventCallbacks.forEach((callback) => {
        try {
          Promise.resolve(callback(...args)).catch((error) =>
            console.error(`Audio event ${event} failed:`, error)
          );
        } catch (error) {
          console.error(`Audio event ${event} failed:`, error);
        }
      });
    }
  }

  on(event: string, callback: Function) {
    if (!this.callbacks[event]) {
      this.callbacks[event] = [];
    }
    this.callbacks[event].push(callback);
  }

  off(event: string, callback: Function) {
    const eventCallbacks = this.callbacks[event];
    if (eventCallbacks) {
      this.callbacks[event] = eventCallbacks.filter((cb) => cb !== callback);
    }
  }

  clearAllListeners() {
    this.callbacks = {};
  }

  // ==================== EQ ====================

  private setupEQ() {
    if (!isElectron) {
      // WebView/Electron is the only supported Web Audio EQ path. Keep the
      // regular media element volume path on Android and in the browser.
      this.bypass = true;
      return;
    }

    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.gainNode = this.context.createGain();

        // Create 10-band filter chain once; newly adopted audio elements are
        // connected to the same current EQ graph.
        const savedSettings = this.loadEQSettings();
        this.filters = this.frequencies.map((freq) => {
          const filter = this.context!.createBiquadFilter();
          filter.type = 'peaking';
          filter.frequency.value = freq;
          filter.Q.value = 1;
          filter.gain.value = savedSettings[freq.toString()] || 0;
          return filter;
        });
        this.setupContextStateMonitoring();
        this.restoreSavedAudioDevice();
      }

      let source = this.sourceNodes.get(this.audio);
      if (!source) {
        source = this.context.createMediaElementSource(this.audio);
        this.sourceNodes.set(this.audio, source);
      }
      this.sourceNode = source;
      this.audio.volume = 1;
      this.applyBypassState();
      this.applyVolume(this.volume);
    } catch (error) {
      console.error('EQ initialization failed:', error);
      // Fallback: connect audio directly (no EQ)
      this.sourceNode = null;
      this.context = null;
    }
  }

  private applyBypassState() {
    if (!this.sourceNode || !this.gainNode || !this.context) return;

    try {
      for (const node of this.sourceNodes.values()) {
        try {
          node.disconnect();
        } catch {
          /* already disconnected */
        }
      }
      this.filters.forEach((filter) => {
        try {
          filter.disconnect();
        } catch {
          /* already disconnected */
        }
      });
      try {
        this.gainNode.disconnect();
      } catch {
        /* already disconnected */
      }

      if (this.bypass) {
        // EQ disabled: source -> gain -> destination
        this.sourceNode.connect(this.gainNode);
        this.gainNode.connect(this.context.destination);
      } else {
        // EQ enabled: source -> filters[0] -> ... -> filters[9] -> gain -> destination
        this.sourceNode.connect(this.filters[0]);
        this.filters.forEach((filter, index) => {
          if (index < this.filters.length - 1) {
            filter.connect(this.filters[index + 1]);
          }
        });
        this.filters[this.filters.length - 1].connect(this.gainNode);
        this.gainNode.connect(this.context.destination);
      }
    } catch (error) {
      console.error('Error applying EQ state, attempting fallback:', error);
      try {
        if (this.sourceNode && this.context) {
          this.sourceNode.connect(this.context.destination);
        }
      } catch (fallbackError) {
        console.error('Fallback connection also failed:', fallbackError);
        this.emit('audio_error', { type: 'graph_disconnected', error: fallbackError });
      }
    }
  }

  public isEQEnabled(): boolean {
    return !this.bypass;
  }

  public setEQEnabled(enabled: boolean) {
    this.bypass = !enabled;
    localStorage.setItem('eqBypass', JSON.stringify(this.bypass));

    if (this.sourceNode && this.gainNode && this.context) {
      this.applyBypassState();
    }
  }

  public setEQFrequencyGain(frequency: string, gain: number) {
    const filterIndex = this.frequencies.findIndex((f) => f.toString() === frequency);
    if (filterIndex !== -1 && this.filters[filterIndex]) {
      this.filters[filterIndex].gain.setValueAtTime(gain, this.context?.currentTime || 0);
      this.saveEQSettings(frequency, gain);
    }
  }

  public resetEQ() {
    this.filters.forEach((filter) => {
      filter.gain.setValueAtTime(0, this.context?.currentTime || 0);
    });
    localStorage.removeItem('eqSettings');
  }

  public getAllEQSettings(): { [key: string]: number } {
    return this.loadEQSettings();
  }

  public getCurrentPreset(): string | null {
    return localStorage.getItem('currentPreset');
  }

  public setCurrentPreset(preset: string): void {
    localStorage.setItem('currentPreset', preset);
  }

  private saveEQSettings(frequency: string, gain: number) {
    const settings = this.loadEQSettings();
    settings[frequency] = gain;
    localStorage.setItem('eqSettings', JSON.stringify(settings));
  }

  private loadEQSettings(): { [key: string]: number } {
    try {
      return {
        ...this.defaultEQSettings,
        ...JSON.parse(localStorage.getItem('eqSettings') || '{}')
      };
    } catch {
      return { ...this.defaultEQSettings };
    }
  }

  // ==================== Operation Lock ====================

  private setOperationLock(): boolean {
    if (this.operationLock) {
      return false;
    }
    this.operationLock = true;

    if (this.operationLockTimer) clearTimeout(this.operationLockTimer);
    this.operationLockTimer = setTimeout(() => {
      console.warn('操作锁超时自动释放');
      this.releaseOperationLock();
    }, 5000);

    return true;
  }

  public releaseOperationLock(): void {
    this.operationLock = false;
    if (this.operationLockTimer) {
      clearTimeout(this.operationLockTimer);
      this.operationLockTimer = null;
    }
  }

  public forceResetOperationLock(): void {
    this.operationLock = false;
    if (this.operationLockTimer) {
      clearTimeout(this.operationLockTimer);
      this.operationLockTimer = null;
    }
  }

  // ==================== Playback Control ====================

  public play(
    url: string,
    track: SongResult,
    isPlay: boolean = true,
    seekTime?: number,
    _existingSound?: HTMLAudioElement
  ): Promise<HTMLAudioElement> {
    if (!url || !track) {
      return Promise.reject(new Error('缺少必要参数: url和track'));
    }

    this.pendingLoadCleanup?.();
    const previousAudio = this.audio;
    const previousTrack = this.currentTrack;
    const previousWasPlaying = !previousAudio.paused && !previousAudio.ended;
    let canonicalUrl = url;
    try {
      canonicalUrl = new URL(url, document.baseURI).href;
    } catch {
      // Keep custom media schemes as supplied when URL normalization is unavailable.
    }

    const sameActiveUrl = previousAudio.src === canonicalUrl && !previousAudio.error;
    const preserveActive = !!previousTrack && !sameActiveUrl;
    const canUsePreloaded =
      !!_existingSound &&
      _existingSound !== previousAudio &&
      _existingSound.src === canonicalUrl &&
      _existingSound.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      !_existingSound.error;
    if (_existingSound && _existingSound !== previousAudio && !canUsePreloaded) {
      this.disposeAudioElement(_existingSound);
    }

    let candidate: HTMLAudioElement;
    try {
      candidate = canUsePreloaded
        ? _existingSound!
        : sameActiveUrl || !preserveActive
          ? previousAudio
          : new Audio();
    } catch (error) {
      return Promise.reject(error);
    }
    candidate.crossOrigin = 'anonymous';
    candidate.preload = 'auto';
    candidate.muted = false;
    const staged = candidate !== previousAudio;
    let switched = false;

    this.forceResetOperationLock();
    this.setOperationLock();

    return new Promise<HTMLAudioElement>((resolve, reject) => {
      let retryCount = 0;
      const maxRetries = 1;
      let settled = false;
      let retryTimer: ReturnType<typeof setTimeout> | null = null;
      let loadTimer: ReturnType<typeof setTimeout> | null = null;
      let removeListeners = () => {};

      const restorePreviousAudio = () => {
        if (switched) {
          this.audioEventCleanup?.();
          this.audioEventCleanup = null;
          try {
            candidate.pause();
          } catch {
            // Ignore an element that was already stopped by the browser.
          }
          this.disposeAudioElement(candidate);
          this.audio = previousAudio;
          this.bindAudioEvents();
          switched = false;
          this.currentTrack = previousTrack;
          this.setupEQ();
          this.applyVolume(this.volume);
          if (previousTrack) {
            this.updateMediaSessionMetadata(previousTrack);
            this.updateMediaSessionPositionState();
          }
          if (previousWasPlaying && !previousAudio.ended) {
            void previousAudio.play().catch((error) => {
              console.warn('恢复上一首播放失败:', error);
            });
          }
        } else {
          if (staged) this.disposeAudioElement(candidate);
          this.currentTrack = previousTrack;
        }
      };

      const cleanup = () => {
        if (retryTimer) {
          clearTimeout(retryTimer);
          retryTimer = null;
        }
        if (loadTimer) {
          clearTimeout(loadTimer);
          loadTimer = null;
        }
        removeListeners();
        if (this.pendingLoadCleanup === cancelLoad) {
          this.pendingLoadCleanup = null;
        }
      };

      const failLoad = (error: Error) => {
        if (settled) return;
        settled = true;
        restorePreviousAudio();
        cleanup();
        this._isLoading = false;
        this.releaseOperationLock();
        reject(error);
      };

      const cancelLoad = () => failLoad(new DOMException('Playback cancelled', 'AbortError'));
      this.pendingLoadCleanup = cancelLoad;

      const startAudio = async () => {
        if (settled) return;
        removeListeners();
        try {
          if (candidate !== this.audio) {
            this.activateAudioElement(candidate);
            switched = true;
          }
          this.currentTrack = track;
          this.setupEQ();
          this.applyVolume(this.volume);
          candidate.playbackRate = this.playbackRate;
          if (seekTime !== undefined && Number.isFinite(seekTime) && seekTime >= 0) {
            try {
              candidate.currentTime = seekTime;
            } catch {
              // Metadata may not expose a seekable range yet; playback can still start.
            }
          }

          if (isPlay && this.context?.state === 'suspended') {
            await this.context.resume();
          }
          if (settled) return;
          if (isPlay) await candidate.play();
          else candidate.pause();
          if (settled) return;

          settled = true;
          cleanup();
          if (candidate !== previousAudio) this.disposeAudioElement(previousAudio);
          this._isLoading = false;
          this.updateMediaSessionMetadata(track);
          this.updateMediaSessionPositionState();
          this.emit('load');
          this.releaseOperationLock();
          resolve(this.audio);
        } catch (error) {
          if (settled) return;
          this.emit('playerror', { track, error });
          failLoad(error as Error);
        }
      };

      const tryPlay = () => {
        if (settled) return;
        this._isLoading = true;
        loadTimer = setTimeout(() => failLoad(new Error('Audio loading timed out')), 8000);
        const onError = () => {
          if (settled) return;
          removeListeners();
          if (loadTimer) clearTimeout(loadTimer);
          loadTimer = null;
          const error = candidate.error;
          console.error('Audio load error:', error?.code, error?.message);
          this.emit('loaderror', { track, error });

          // MEDIA_ERR_SRC_NOT_SUPPORTED(4)：源本身无效（URL 已失效/返回了
          // 非音频内容），用同一 URL 重试毫无意义。此处只跳过重试并把失败抛给
          // 调用方，由 playTrack 清解析缓存后重新取 URL；加载期间不发 url_expired，
          // 避免与调用方的失败恢复同时抢占播放。播放中才失效的源由 bindAudioEvents 发事件。
          const isSrcNotSupported = error?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED;

          if (!isSrcNotSupported && retryCount < maxRetries) {
            retryCount++;
            console.log(`Retrying playback (${retryCount}/${maxRetries})...`);
            retryTimer = setTimeout(() => {
              retryTimer = null;
              tryPlay();
            }, 150 * retryCount);
          } else {
            // 初次加载失败交给调用方恢复，避免与切歌失败处理同时抢占播放。
            failLoad(
              Object.assign(new Error('音频加载失败，请尝试切换其他歌曲'), {
                mediaCode: error?.code
              })
            );
          }
        };

        removeListeners = () => {
          candidate.removeEventListener('loadeddata', startAudio);
          candidate.removeEventListener('canplay', startAudio);
          candidate.removeEventListener('error', onError);
        };

        if (candidate.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && !candidate.error) {
          void startAudio();
          return;
        }

        candidate.addEventListener('loadeddata', startAudio, { once: true });
        candidate.addEventListener('canplay', startAudio, { once: true });
        candidate.addEventListener('error', onError, { once: true });

        // Load a new element in the background so a failing next URL never
        // destroys the currently audible track.
        try {
          if (!canUsePreloaded && candidate !== previousAudio) candidate.src = url;
          else if (candidate === previousAudio && candidate.src !== canonicalUrl)
            candidate.src = url;
          candidate.load();
        } catch (error) {
          failLoad(error as Error);
        }
      };

      tryPlay();
    });
  }

  public pause() {
    this.pendingLoadCleanup?.();
    this.forceResetOperationLock();
    this._isLoading = false;
    try {
      this.audio.pause();
    } catch (error) {
      console.error('暂停音频失败:', error);
    }
  }

  public stop() {
    this.forceResetOperationLock();
    // 移除尚未结算的加载监听器，避免 stop 后旧的 canplay/error 仍触发过期回调
    if (this.pendingLoadCleanup) {
      this.pendingLoadCleanup();
      this.pendingLoadCleanup = null;
    }
    this._isLoading = false;
    try {
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.audio.load(); // Reset the element
    } catch (error) {
      console.error('停止音频失败:', error);
    }
    this.currentTrack = null;
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'none';
    }
  }

  public seek(time: number) {
    if (!Number.isFinite(time) || !this.audio.src) return;
    this.forceResetOperationLock();
    try {
      const duration = this.audio.duration;
      const target = Math.max(
        0,
        Number.isFinite(duration) && duration > 0 ? Math.min(time, duration) : time
      );
      this.audio.currentTime = target;
      this.emit('seek_start', target);
      this.updateMediaSessionPositionState();
    } catch (error) {
      console.error('Seek操作失败:', error);
    }
  }

  public setVolume(volume: number) {
    this.applyVolume(volume);
  }

  private applyVolume(volume: number) {
    if (!Number.isFinite(volume)) return;
    const normalizedVolume = Math.max(0, Math.min(1, volume));
    this.volume = normalizedVolume;

    if (this.gainNode && this.context) {
      this.gainNode.gain.cancelScheduledValues(this.context.currentTime);
      this.gainNode.gain.setValueAtTime(normalizedVolume, this.context.currentTime);
    } else {
      // Fallback: direct volume (no Web Audio context)
      this.audio.volume = normalizedVolume;
    }

    try {
      localStorage.setItem('volume', normalizedVolume.toString());
    } catch (error) {
      console.warn('保存音量失败:', error);
    }
  }

  public setPlaybackRate(rate: number) {
    if (!Number.isFinite(rate) || rate <= 0) return;
    this.playbackRate = rate;
    this.audio.playbackRate = rate;
    this.updateMediaSessionPositionState();
  }

  public getPlaybackRate(): number {
    return this.playbackRate;
  }

  // ==================== State Queries ====================

  getCurrentSound(): HTMLAudioElement | null {
    return this.audio.src ? this.audio : null;
  }

  getCurrentTrack(): SongResult | null {
    return this.currentTrack;
  }

  isLoading(): boolean {
    return this._isLoading || this.operationLock;
  }

  isActuallyPlaying(): boolean {
    if (!this.audio.src) return false;
    try {
      const isPlaying = !this.audio.paused && !this.audio.ended;
      const contextOk = !this.context || this.context.state === 'running';
      return isPlaying && !this._isLoading && contextOk;
    } catch (error) {
      console.error('检查播放状态出错:', error);
      return false;
    }
  }

  // ==================== Audio Output Devices ====================

  public async getAudioOutputDevices(): Promise<AudioOutputDevice[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioOutputs = devices.filter((d) => d.kind === 'audiooutput');

      return audioOutputs.map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `Speaker ${index + 1}`,
        isDefault: device.deviceId === 'default' || device.deviceId === ''
      }));
    } catch (error) {
      console.error('枚举音频设备失败:', error);
      return [{ deviceId: 'default', label: 'Default', isDefault: true }];
    }
  }

  public async setAudioOutputDevice(deviceId: string): Promise<boolean> {
    try {
      if (this.context && typeof (this.context as any).setSinkId === 'function') {
        await (this.context as any).setSinkId(deviceId);
        this.currentSinkId = deviceId;
        localStorage.setItem('audioOutputDeviceId', deviceId);
        console.log('音频输出设备已切换:', deviceId);
        return true;
      } else {
        console.warn('AudioContext.setSinkId 不可用');
        return false;
      }
    } catch (error) {
      console.error('设置音频输出设备失败:', error);
      return false;
    }
  }

  public getCurrentSinkId(): string {
    return this.currentSinkId;
  }

  private async restoreSavedAudioDevice(): Promise<void> {
    const savedDeviceId = localStorage.getItem('audioOutputDeviceId');
    if (savedDeviceId && savedDeviceId !== 'default') {
      try {
        await this.setAudioOutputDevice(savedDeviceId);
      } catch (error) {
        console.warn('恢复音频输出设备失败，回退到默认设备:', error);
        localStorage.removeItem('audioOutputDeviceId');
        this.currentSinkId = 'default';
      }
    }
  }

  private setupContextStateMonitoring() {
    if (!this.context) return;

    this.context.addEventListener('statechange', async () => {
      console.log('AudioContext state changed:', this.context?.state);

      if (this.context?.state === 'suspended' && !this.audio.paused) {
        console.log('AudioContext suspended while playing, attempting to resume...');
        try {
          await this.context.resume();
          console.log('AudioContext resumed successfully');
        } catch (e) {
          console.error('Failed to resume AudioContext:', e);
          this.emit('audio_error', { type: 'context_suspended', error: e });
        }
      } else if (this.context?.state === 'closed') {
        console.warn('AudioContext was closed unexpectedly');
        this.emit('audio_error', { type: 'context_closed' });
      }
    });
  }
}

export const audioService = new AudioService();
