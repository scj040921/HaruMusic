import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePlayerCoreStore } from '@/store/modules/playerCore';
import { usePlaylistStore } from '@/store/modules/playlist';
import type { SongResult } from '@/types/music';

const mocks = vi.hoisted(() => ({
  settings: { setData: { singleSongPlayMode: 'replace' } },
  intelligence: { isIntelligenceMode: false, clearIntelligenceMode: vi.fn() },
  getSongDetail: vi.fn(),
  preload: vi.fn(),
  retain: vi.fn(),
  play: vi.fn()
}));

vi.mock('naive-ui', () => ({ createDiscreteApi: () => ({ message: {} }) }));
vi.mock('@/../i18n/renderer', () => ({ default: { global: { t: (key: string) => key } } }));
vi.mock('@/hooks/usePlayerHooks', () => ({
  useSongDetail: () => ({ getSongDetail: mocks.getSongDetail })
}));
vi.mock('@/services/audioService', () => ({ audioService: {} }));
vi.mock('@/services/playbackController', async () => {
  const { playbackRequestManager } = await import('@/services/playbackRequestManager');
  return {
    playTrack: mocks.play,
    getCurrentGeneration: () => playbackRequestManager.getGeneration()
  };
});
vi.mock('@/services/preloadService', () => ({
  preloadService: { load: mocks.preload, getRevision: () => 0, retain: mocks.retain }
}));
vi.mock('@/store/modules/settings', () => ({ useSettingsStore: () => mocks.settings }));
vi.mock('@/store/modules/intelligenceMode', () => ({
  useIntelligenceModeStore: () => mocks.intelligence
}));
vi.mock('@/store/modules/sleepTimer', () => ({ useSleepTimerStore: () => ({}) }));
vi.mock('@/utils', () => ({ getImgUrl: (url: string) => url }));

const makeSong = (id: number): SongResult =>
  ({
    id,
    name: String(id),
    source: 'netease',
    picUrl: '',
    lyric: { lrcArray: [{ text: 'Test' }], lrcTimeArray: [0] }
  }) as SongResult;

describe('single-song queue preference (#766)', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
    vi.stubGlobal('window', {});
    setActivePinia(createPinia());
    mocks.settings.setData.singleSongPlayMode = 'replace';
    mocks.preload.mockResolvedValue('');
    mocks.play.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('replaces the queue with the song context and selects the clicked song', () => {
    const queue = usePlaylistStore();
    const songs = [makeSong(1), makeSong(2), makeSong(3)];
    queue.setPlayList([makeSong(99)]);

    queue.prepareSongPlayback(songs[1], songs);

    expect(queue.playList.map((song) => song.id)).toEqual([1, 2, 3]);
    expect(queue.playListIndex).toBe(1);
    expect(queue.playList).not.toBe(songs);
  });

  it('adds only the selected song when the add option is selected', () => {
    mocks.settings.setData.singleSongPlayMode = 'add';
    const queue = usePlaylistStore();
    const current = makeSong(99);
    queue.setPlayList([current, makeSong(100)]);
    usePlayerCoreStore().playMusic = current;
    const songs = [makeSong(1), makeSong(2), makeSong(3)];

    queue.prepareSongPlayback(songs[1], songs);

    expect(queue.playList.map((song) => song.id)).toEqual([99, 2, 100]);
    expect(queue.playListIndex).toBe(1);
  });

  it('selects an existing song without duplicating or moving it in add mode', () => {
    mocks.settings.setData.singleSongPlayMode = 'add';
    const queue = usePlaylistStore();
    const songs = [makeSong(1), makeSong(2), makeSong(3)];
    queue.setPlayList(songs);
    usePlayerCoreStore().playMusic = songs[0];

    queue.prepareSongPlayback(songs[2], songs);

    expect(queue.playList.map((song) => song.id)).toEqual([1, 2, 3]);
    expect(queue.playListIndex).toBe(2);
  });

  it('does not discard next-play edits when toggling the current song', () => {
    const queue = usePlaylistStore();
    const songs = [makeSong(1), makeSong(2), makeSong(3)];
    queue.setPlayList(songs);
    usePlayerCoreStore().playMusic = songs[0];
    queue.addToNextPlay(makeSong(99));
    const editedQueue = queue.playList;

    queue.prepareSongPlayback(songs[0], songs);

    expect(queue.playList).toBe(editedQueue);
    expect(queue.playList.map((song) => song.id)).toEqual([1, 99, 2, 3]);
  });

  it('selects the correct index in shuffle mode and preserves the original order', () => {
    const queue = usePlaylistStore();
    queue.playMode = 2;
    const songs = [makeSong(1), makeSong(2), makeSong(3)];

    queue.prepareSongPlayback(songs[1], songs);
    expect(queue.playList[queue.playListIndex].id).toBe(2);
    expect(queue.originalPlayList.map((song) => song.id)).toEqual([1, 2, 3]);

    usePlayerCoreStore().playMusic = songs[1];
    queue.restoreOriginalOrder();
    expect(queue.playList.map((song) => song.id)).toEqual([1, 2, 3]);
    expect(queue.playListIndex).toBe(1);
  });

  it('falls back to adding the song when there is no valid list context', () => {
    const queue = usePlaylistStore();
    queue.setPlayList([makeSong(99)]);

    queue.prepareSongPlayback(makeSong(1), []);
    expect(queue.playList.map((song) => song.id)).toEqual([99, 1]);
    expect(queue.playListIndex).toBe(1);
  });

  it('leaves FM mode even when the new context contains only one local song', () => {
    const core = usePlayerCoreStore();
    core.isFmPlaying = true;
    const queue = usePlaylistStore();
    const song = { ...makeSong(1), playMusicUrl: 'local:////Music/one.mp3' };

    queue.prepareSongPlayback(song, [song]);
    expect(core.isFmPlaying).toBe(false);
  });

  it('ignores old preloads after the user replaces the queue', async () => {
    const queue = usePlaylistStore();
    const oldSong = makeSong(1);
    let resolve!: (song: SongResult) => void;
    mocks.getSongDetail.mockReturnValueOnce(
      new Promise<SongResult>((done) => {
        resolve = done;
      })
    );
    queue.setPlayList([oldSong]);
    const fetching = queue.fetchSongs(0, 1);
    queue.setPlayList([makeSong(2)]);
    resolve({ ...oldSong, playMusicUrl: 'https://example.com/old.mp3' });
    await fetching;

    expect(queue.playList.map((song) => song.id)).toEqual([2]);
    expect(mocks.preload).not.toHaveBeenCalled();
  });

  it('still enriches the queue when a preload belongs to the current list', async () => {
    const queue = usePlaylistStore();
    const song = makeSong(1);
    mocks.getSongDetail.mockResolvedValueOnce({
      ...song,
      playMusicUrl: 'https://example.com/one.mp3'
    });
    queue.setPlayList([song]);
    await queue.fetchSongs(0, 1);

    expect(queue.playList[0].playMusicUrl).toBe('https://example.com/one.mp3');
    expect(mocks.preload).toHaveBeenCalledTimes(1);
  });

  it('moves the requested provider without losing the playing provider with the same ID', () => {
    const queue = usePlaylistStore(),
      core = usePlayerCoreStore();
    const a = makeSong(1),
      b = { ...makeSong(1), source: 'plugin:other' } as SongResult,
      c = makeSong(2);
    core.playMusic = b;
    queue.setPlayList([a, b, c]);
    queue.moveQueueSong(a, c);
    expect(queue.playList).toEqual([b, c, a]);
    expect(queue.playList[queue.playListIndex]).toBe(b);
    expect(core.playMusic).toEqual(b);
  });

  it('can play a different provider next even if its numeric song ID matches the current one', () => {
    const queue = usePlaylistStore(),
      core = usePlayerCoreStore();
    const a = makeSong(1),
      b = { ...makeSong(1), source: 'plugin:other' } as SongResult,
      c = makeSong(2);
    core.playMusic = b;
    queue.setPlayList([a, b, c]);
    queue.addToNextPlay(a);
    expect(queue.playList).toEqual([b, a, c]);
    expect(queue.playListIndex).toBe(0);
  });

  it('appends unique provider tracks in order without reshuffling or pausing', () => {
    const queue = usePlaylistStore();
    const core = usePlayerCoreStore();
    const current = makeSong(1);
    const otherSource = { ...current, source: 'plugin:other' } as SongResult;
    const last = makeSong(2);
    core.playMusic = current;
    core.play = true;
    queue.playMode = 2;
    queue.setPlayList([current, last]);

    expect(queue.appendToQueue([current, otherSource, otherSource, makeSong(3)])).toBe(2);
    expect(queue.playList).toEqual([current, last, otherSource, makeSong(3)]);
    expect(queue.originalPlayList).toEqual(queue.playList);
    expect(queue.playListIndex).toBe(0);
    expect(core.play).toBe(true);
  });

  it('keeps the current song and index if a manual skip fails', async () => {
    const queue = usePlaylistStore();
    const core = usePlayerCoreStore();
    const current = makeSong(1);
    core.playMusic = current;
    core.play = true;
    queue.setPlayList([current, makeSong(2), makeSong(3)]);
    const pause = vi.spyOn(core, 'handlePause');
    mocks.play.mockResolvedValueOnce(false);

    expect(await queue.nextPlay()).toBe(false);
    expect(queue.playListIndex).toBe(0);
    expect(core.play).toBe(true);
    expect(pause).not.toHaveBeenCalled();
  });

  it('removes only the specified source and never pauses a same-ID current track from another source', () => {
    const queue = usePlaylistStore(),
      core = usePlayerCoreStore();
    const a = makeSong(1),
      b = { ...makeSong(1), source: 'plugin:other' } as SongResult;
    core.playMusic = b;
    core.play = true;
    queue.setPlayList([a, b]);
    queue.removeFromPlayList(a.id, a.source);
    expect(queue.playList).toEqual([b]);
    expect(core.play).toBe(true);
    expect(queue.playListIndex).toBe(0);
  });

  it('retains only the current track without interrupting playback and discards irrelevant warmups', () => {
    const queue = usePlaylistStore(),
      core = usePlayerCoreStore();
    const song = makeSong(2);
    core.playMusic = song;
    core.play = true;
    queue.setPlayList([makeSong(1), song, makeSong(3)]);
    queue.retainCurrentSong();
    expect(queue.playList).toEqual([song]);
    expect(queue.playListIndex).toBe(0);
    expect(core.play).toBe(true);
    expect(mocks.retain).toHaveBeenCalledWith(song);
  });

  it('keeps both sources in shuffle history when editing and restoring the queue', () => {
    const queue = usePlaylistStore(),
      core = usePlayerCoreStore();
    const a = makeSong(1),
      b = { ...makeSong(1), source: 'plugin:other' } as SongResult;
    core.playMusic = b;
    queue.playMode = 2;
    queue.setPlayList([a, b, makeSong(2)]);
    expect(queue.playList[queue.playListIndex]).toEqual(b);
    queue.moveQueueSong(a, b);
    queue.restoreOriginalOrder();
    expect(queue.playList).toEqual([a, b, makeSong(2)]);
    expect(queue.playList[queue.playListIndex]).toEqual(b);
  });

  it('advances exactly once to the surviving next item when the playing item is removed', async () => {
    const queue = usePlaylistStore(),
      core = usePlayerCoreStore();
    const songs = [makeSong(1), makeSong(2), makeSong(3)];
    core.playMusic = songs[0];
    core.play = true;
    queue.setPlayList(songs);
    vi.spyOn(core, 'handlePause').mockImplementation(() => {
      core.play = false;
      core.userPlayIntent = false;
    });
    queue.removeFromPlayList(1, 'netease');
    await vi.waitFor(() => expect(mocks.play).toHaveBeenCalledOnce());
    expect(mocks.play).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }), true);
    expect(queue.playList.map((song) => song.id)).toEqual([2, 3]);
    expect(queue.playListIndex).toBe(0);
  });

  it('does not toggle the playing source when choosing a same-ID item from another provider', async () => {
    const queue = usePlaylistStore(),
      core = usePlayerCoreStore();
    const a = makeSong(1),
      b = { ...makeSong(1), source: 'plugin:other' } as SongResult;
    core.playMusic = a;
    core.play = true;
    queue.setPlayList([a, b]);
    const start = vi.spyOn(core, 'setPlayMusic').mockResolvedValue(true);
    expect(await queue.setPlay(b)).toBe(true);
    expect(start).toHaveBeenCalledWith(b);
    expect(core.play).toBe(true);
    expect(queue.playListIndex).toBe(1);
  });
});
