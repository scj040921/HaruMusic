import { ipcMain } from 'electron';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { getSharedStore } from './modules/config';
import { startApiOnAvailablePort } from './musicApiLifecycle';
import { type Platform, unblockMusic } from './unblockMusic';

// 必须在 import netease-cloud-music-api-alger 之前创建 anonymous_token 文件
// 否则模块加载时 readFileSync 会因文件不存在而崩溃
if (!fs.existsSync(path.resolve(os.tmpdir(), 'anonymous_token'))) {
  fs.writeFileSync(path.resolve(os.tmpdir(), 'anonymous_token'), '', 'utf-8');
}

const store = getSharedStore();

// 设置音乐解析的处理程序
ipcMain.handle('unblock-music', async (_event, id, songData, enabledSources) => {
  try {
    const result = await unblockMusic(id, songData, 1, enabledSources as Platform[]);
    return result;
  } catch (error) {
    console.error('音乐解析失败:', error);
    return { error: (error as Error).message || '未知错误' };
  }
});

let startup: Promise<void> | undefined;
function startMusicApi(): Promise<void> {
  if (!startup)
    startup = bindMusicApi().catch((error) => {
      startup = undefined;
      throw error;
    });
  return startup;
}

async function bindMusicApi(): Promise<void> {
  console.log('MUSIC API STARTING...');
  const settings = store.get('set') as any;
  const originalPort = Number(settings?.musicApiPort) || 30488;
  const server = require('netease-cloud-music-api-alger/server');
  const { port } = await startApiOnAvailablePort(
    (candidate) => server.serveNcmApi({ port: candidate, host: '127.0.0.1' }),
    originalPort
  );
  if (port !== originalPort) {
    store.set('set', { ...(store.get('set') as any), musicApiPort: port });
  }
  console.log(`MUSIC API STARTED on port ${port}`);
}

export { startMusicApi };
