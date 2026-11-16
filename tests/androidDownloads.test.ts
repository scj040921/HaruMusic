import { describe, expect, it, vi } from 'vitest';
vi.mock('@capacitor/core', () => ({
  Capacitor: { convertFileSrc: (s: string) => s },
  registerPlugin: () => ({})
}));
import {
  type AndroidDownload,
  filterDownloads,
  toOfflineSong,
  unwrapDownloadSource
} from '../src/renderer/services/androidDownloads';
describe('native Android download transport', () => {
  it('unwraps the on-device media bridge and preserves required source headers', () => {
    const data = {
      url: 'https://cdn.test/audio.flac?token=valid',
      headers: { Referer: 'https://music.test', Authorization: 'Bearer sample' }
    };
    expect(
      unwrapDownloadSource(
        'http://127.0.0.1:30488/__media?d=' + encodeURIComponent(JSON.stringify(data))
      )
    ).toEqual(data);
  });
  it('passes direct audio URLs without adding a proxy', () => {
    expect(unwrapDownloadSource('https://cdn.test/a.mp3')).toEqual({
      url: 'https://cdn.test/a.mp3',
      headers: {}
    });
  });
  it('rejects file and script URLs in a media descriptor', () => {
    for (const url of ['file:///private/config', 'javascript:alert(1)'])
      expect(() =>
        unwrapDownloadSource(
          'http://127.0.0.1:30488/__media?d=' + encodeURIComponent(JSON.stringify({ url }))
        )
      ).toThrow();
  });
  it('combines state and artist search without mutating download order', () => {
    const task = (taskId: string, state: AndroidDownload['state'], createdAt: number) =>
      ({
        taskId,
        state,
        createdAt,
        songInfo: { id: 1, name: 'JANE DOE', ar: [{ name: '米津玄师' }] }
      }) as AndroidDownload;
    const tasks = [
      task('old', 'completed', 1),
      task('failed', 'error', 3),
      task('new', 'completed', 2)
    ];
    expect(filterDownloads(tasks, '已完成', 'ｊａｎｅ 米津').map((t) => t.taskId)).toEqual([
      'new',
      'old'
    ]);
    expect(filterDownloads(tasks, '失败').map((t) => t.taskId)).toEqual(['failed']);
    expect(tasks[0].taskId).toBe('old');
  });
  it('builds independent lazy offline entries for two downloads of the same catalog song', () => {
    const make = (taskId: string) =>
      toOfflineSong({
        taskId,
        songInfo: { id: 1, name: 'Offline', source: 'netease' }
      } as AndroidDownload);
    expect(make('a')).toMatchObject({ id: 'android-download:a', source: 'local', name: 'Offline' });
    expect(make('a').id).not.toBe(make('b').id);
    expect(make('a').playMusicUrl).toBeUndefined();
  });
});
