import { Capacitor, registerPlugin } from '@capacitor/core';

import type { DownloadSongInfo } from '../../shared/download';
export type AndroidDownload = {
  taskId: string;
  songInfo: DownloadSongInfo & { source?: string };
  filename: string;
  type: string;
  state: 'queued' | 'downloading' | 'completed' | 'error';
  progress: number;
  loaded: number;
  total: number;
  error?: string;
  uri?: string;
  createdAt: number;
};
export const androidDownloads = registerPlugin<{
  enqueue(options: {
    url: string;
    headers: Record<string, string>;
    filename: string;
    type: string;
    songInfo: DownloadSongInfo;
  }): Promise<{ taskId: string }>;
  list(): Promise<{ tasks: AndroidDownload[] }>;
  remove(options: { taskId: string }): Promise<void>;
  playbackFile(options: { taskId: string }): Promise<{ path: string }>;
  openFolder(): Promise<void>;
}>('HaruDownloads');
export function unwrapDownloadSource(raw: string): {
  url: string;
  headers: Record<string, string>;
} {
  const parsed = new URL(raw);
  if (parsed.hostname === '127.0.0.1' && parsed.pathname === '/__media') {
    const data = JSON.parse(parsed.searchParams.get('d') || '{}');
    const url = new URL(data.url);
    if (!/^https?:$/.test(url.protocol)) throw new Error('下载地址无效');
    return { url: url.href, headers: data.headers || {} };
  }
  if (!/^https?:$/.test(parsed.protocol)) throw new Error('下载地址无效');
  return { url: raw, headers: {} };
}
export const downloadedFileUrl = async (taskId: string) =>
  Capacitor.convertFileSrc((await androidDownloads.playbackFile({ taskId })).path);
