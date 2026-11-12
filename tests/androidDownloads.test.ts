import { describe, expect, it, vi } from 'vitest';
vi.mock('@capacitor/core', () => ({
  Capacitor: { convertFileSrc: (s: string) => s },
  registerPlugin: () => ({})
}));
import { unwrapDownloadSource } from '../src/renderer/services/androidDownloads';
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
});
