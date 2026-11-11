import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/services/musicSource/transport', () => ({
  cancelMusicSourceHttp: vi.fn(),
  requestMusicSourceHttp: vi.fn()
}));
import { PluginSandboxRunner } from '@/services/musicSource/PluginSandboxRunner';
import type { SongResult } from '@/types/music';
import type { MusicSourcePlugin } from '@/types/musicSourcePlugin';

describe('MusicFree native catalog identities', () => {
  let runner: PluginSandboxRunner;
  const song = {
    id: 2745026895,
    source: 'netease',
    name: 'IRIS OUT',
    ar: [{ name: '米津玄師' }],
    dt: 179000
  } as SongResult;
  const nativeItem = {
    id: 'QQ-MID',
    title: 'IRIS OUT',
    artist: '米津玄师',
    duration: 179,
    qualities: { super: { hash: 'QQ-HASH' } }
  };
  beforeEach(() => {
    runner = new PluginSandboxRunner({
      id: 'catalog-test',
      name: 'QQ',
      platform: 'qq',
      source: 'module.exports = {}',
      dialect: 'musicfree'
    } as MusicSourcePlugin);
    vi.spyOn(runner, 'initialize').mockResolvedValue({
      platform: 'QQ音乐',
      methods: ['search', 'getMediaSource'],
      userVariables: []
    });
  });
  it('searches the foreign catalog and passes original media metadata', async () => {
    const invoke = vi
      .spyOn(runner as any, 'invoke')
      .mockImplementation(async (method: any, args: any) => {
        if (method === 'search') return { data: [nativeItem] };
        expect(args[0]).toBe(nativeItem);
        return { url: 'https://cdn.test/qq.flac' };
      });
    expect(await runner.getMediaSource(song, 'auto')).toMatchObject({
      url: 'https://cdn.test/qq.flac'
    });
    expect(await runner.getMediaSource(song, 'auto')).toMatchObject({
      url: 'https://cdn.test/qq.flac'
    });
    expect(invoke.mock.calls.filter((call) => call[0] === 'search')).toHaveLength(1);
  });
  it('does not hand a Netease ID to QQ when matching fails', async () => {
    const invoke = vi
      .spyOn(runner as any, 'invoke')
      .mockResolvedValue({ data: [{ id: 'cover', title: 'IRIS OUT', artist: 'Kotoha' }] });
    expect(await runner.getMediaSource(song, 'auto')).toBeNull();
    expect(invoke.mock.calls.every((call) => call[0] === 'search')).toBe(true);
  });
  it('checks each supported quality once when a higher tier has a bad URL', async () => {
    const invoke = vi
      .spyOn(runner as any, 'invoke')
      .mockImplementation(async (method: any, args: any) => {
        if (method === 'search') return { data: [nativeItem] };
        return {
          url: args[1] === 'super' ? 'https://cdn.test/bad.flac' : 'https://cdn.test/good.mp3'
        };
      });
    const verify = vi.fn(async (url: string) => (url.includes('bad') ? null : url));
    expect(await runner.getMediaSource(song, 'auto', Date.now() + 10000, verify)).toMatchObject({
      url: 'https://cdn.test/good.mp3'
    });
    expect(
      invoke.mock.calls
        .filter((call) => call[0] === 'getMediaSource')
        .map((call) => (call[1] as any[])[1])
    ).toEqual(['super', 'high']);
    expect(verify).toHaveBeenCalledTimes(2);
  });
});
