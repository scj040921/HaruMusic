import { app, BrowserWindow, ipcMain, shell } from 'electron';
import electronUpdater, {
  type ProgressInfo,
  type UpdateDownloadedEvent,
  type UpdateInfo
} from 'electron-updater';

import {
  APP_UPDATE_RELEASE_URL,
  APP_UPDATE_STATUS,
  type AppUpdateState,
  createDefaultAppUpdateState
} from '../../shared/appUpdate';
import { getGithubUpdateCredential } from './githubUpdateAuth';
import { cleanupLxMusicHttp } from './lxMusicHttp';
import { setAppQuitting } from './window';

const { autoUpdater } = electronUpdater;

type CheckUpdateOptions = {
  manual?: boolean;
};

let updateState: AppUpdateState = createDefaultAppUpdateState(app.getVersion());
let isInitialized = false;
let checkForUpdatesPromise: Promise<AppUpdateState> | null = null;
let downloadUpdatePromise: Promise<AppUpdateState> | null = null;

const isAutoUpdateSupported = (): boolean => app.isPackaged && process.platform === 'win32';

const configurePrivateFeed = async (): Promise<void> => {
  const token = await getGithubUpdateCredential();
  // This credential exists only in the running process, never in the package.
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'scj040921',
    repo: 'HaruMusic',
    private: true,
    token
  });
};

const normalizeReleaseNotes = (releaseNotes: UpdateInfo['releaseNotes']): string => {
  if (typeof releaseNotes === 'string') {
    return releaseNotes;
  }

  if (Array.isArray(releaseNotes)) {
    return releaseNotes
      .map((item) => {
        const version = item.version ? `## ${item.version}` : '';
        return [version, item.note].filter(Boolean).join('\n');
      })
      .join('\n\n');
  }

  return '';
};

const broadcastUpdateState = () => {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('app-update:state', updateState);
  }
};

const setUpdateState = (partial: Partial<AppUpdateState>) => {
  updateState = {
    ...updateState,
    ...partial
  };
  broadcastUpdateState();
};

const resetUpdateState = () => {
  updateState = {
    ...createDefaultAppUpdateState(app.getVersion()),
    supported: isAutoUpdateSupported()
  };
};

const getUnsupportedMessage = () => '自动更新仅适用于已安装的 Windows 版本。';

const applyUpdateInfo = (
  status: AppUpdateState['status'],
  info?: Pick<UpdateInfo, 'version' | 'releaseDate' | 'releaseNotes'>
) => {
  setUpdateState({
    status,
    availableVersion: info?.version ?? null,
    releaseDate: info?.releaseDate ?? null,
    releaseNotes: info ? normalizeReleaseNotes(info.releaseNotes) : '',
    releasePageUrl: APP_UPDATE_RELEASE_URL,
    errorMessage: null,
    checkedAt: Date.now()
  });
};

const checkForUpdates = async (options: CheckUpdateOptions = {}): Promise<AppUpdateState> => {
  if (!updateState.supported) {
    const errorMessage = options.manual ? getUnsupportedMessage() : null;
    setUpdateState({
      status: options.manual ? APP_UPDATE_STATUS.error : APP_UPDATE_STATUS.idle,
      errorMessage
    });
    return updateState;
  }

  if (
    updateState.status === APP_UPDATE_STATUS.available ||
    updateState.status === APP_UPDATE_STATUS.downloading ||
    updateState.status === APP_UPDATE_STATUS.downloaded
  ) {
    return updateState;
  }

  if (checkForUpdatesPromise) {
    return await checkForUpdatesPromise;
  }

  checkForUpdatesPromise = (async () => {
    try {
      setUpdateState({
        status: APP_UPDATE_STATUS.checking,
        errorMessage: null,
        checkedAt: Date.now()
      });
      await configurePrivateFeed();
      await autoUpdater.checkForUpdates();
      return updateState;
    } catch (error) {
      const errorMessage =
        error instanceof Error && error.message.startsWith('无法读取 GitHub CLI')
          ? error.message
          : '检查更新失败，请确认网络和 GitHub 仓库访问权限后重试。';
      setUpdateState({
        status: APP_UPDATE_STATUS.error,
        errorMessage,
        checkedAt: Date.now()
      });
      return updateState;
    } finally {
      checkForUpdatesPromise = null;
    }
  })();

  return await checkForUpdatesPromise;
};

const downloadUpdate = async (): Promise<AppUpdateState> => {
  if (!updateState.supported) {
    setUpdateState({
      status: APP_UPDATE_STATUS.error,
      errorMessage: getUnsupportedMessage()
    });
    return updateState;
  }

  if (updateState.status === APP_UPDATE_STATUS.downloaded) {
    return updateState;
  }

  if (!hasDownloadableUpdate()) {
    setUpdateState({
      status: APP_UPDATE_STATUS.error,
      errorMessage: '当前没有可下载的更新'
    });
    return updateState;
  }

  if (downloadUpdatePromise) {
    return await downloadUpdatePromise;
  }

  downloadUpdatePromise = (async () => {
    try {
      await autoUpdater.downloadUpdate();
      return updateState;
    } catch {
      const errorMessage = '下载更新失败，请确认网络和 GitHub 仓库访问权限后重试。';
      setUpdateState({
        status: APP_UPDATE_STATUS.error,
        errorMessage
      });
      return updateState;
    } finally {
      downloadUpdatePromise = null;
    }
  })();

  return await downloadUpdatePromise;
};

const hasDownloadableUpdate = () => {
  return updateState.status === APP_UPDATE_STATUS.available;
};

const openReleasePage = async (): Promise<boolean> => {
  await shell.openExternal(updateState.releasePageUrl || APP_UPDATE_RELEASE_URL);
  return true;
};

export function setupUpdateHandlers(mainWindow: BrowserWindow) {
  if (isInitialized) {
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.send('app-update:state', updateState);
    });
    return;
  }

  isInitialized = true;
  resetUpdateState();

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  // Upstream error objects can contain request metadata; do not log them.
  autoUpdater.logger = null;

  autoUpdater.on('checking-for-update', () => {
    setUpdateState({
      status: APP_UPDATE_STATUS.checking,
      errorMessage: null,
      checkedAt: Date.now()
    });
  });

  autoUpdater.on('update-available', (info) => {
    applyUpdateInfo(APP_UPDATE_STATUS.available, info);
  });

  autoUpdater.on('update-not-available', () => {
    setUpdateState({
      status: APP_UPDATE_STATUS.notAvailable,
      availableVersion: null,
      releaseNotes: '',
      releaseDate: null,
      errorMessage: null,
      checkedAt: Date.now()
    });
  });

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    setUpdateState({
      status: APP_UPDATE_STATUS.downloading,
      downloadProgress: progress.percent,
      downloadedBytes: progress.transferred,
      totalBytes: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
      errorMessage: null
    });
  });

  autoUpdater.on('update-downloaded', (info: UpdateDownloadedEvent) => {
    setUpdateState({
      status: APP_UPDATE_STATUS.downloaded,
      availableVersion: info.version,
      releaseNotes: normalizeReleaseNotes(info.releaseNotes),
      releaseDate: info.releaseDate,
      downloadProgress: 100,
      downloadedBytes: info.files.reduce((total, file) => total + (file.size ?? 0), 0),
      totalBytes: info.files.reduce((total, file) => total + (file.size ?? 0), 0),
      bytesPerSecond: 0,
      errorMessage: null
    });
  });

  autoUpdater.on('error', () => {
    setUpdateState({
      status: APP_UPDATE_STATUS.error,
      errorMessage: '更新操作失败，请确认网络和 GitHub 仓库访问权限后重试。'
    });
  });

  ipcMain.handle('app-update:get-state', async () => {
    return updateState;
  });

  ipcMain.handle('app-update:check', async (_event, options?: CheckUpdateOptions) => {
    return await checkForUpdates(options);
  });

  ipcMain.handle('app-update:download', async () => {
    return await downloadUpdate();
  });

  ipcMain.handle('app-update:quit-and-install', async () => {
    if (updateState.status !== APP_UPDATE_STATUS.downloaded) return false;
    setAppQuitting(true);
    cleanupLxMusicHttp();
    // Permit every auxiliary window to close while NSIS waits for Electron.
    for (const window of BrowserWindow.getAllWindows()) {
      window.removeAllListeners('close');
      window.webContents.on('will-prevent-unload', (event) => event.preventDefault());
      window.close();
    }
    autoUpdater.quitAndInstall(false, true);
    return true;
  });

  ipcMain.handle('app-update:open-release-page', async () => {
    return await openReleasePage();
  });

  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow.webContents.send('app-update:state', updateState);
  });
}
