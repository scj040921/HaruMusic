import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
const originalPlatform = process.platform;
Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
afterAll(() =>
  Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
);
const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  listeners: new Map<string, (...args: any[]) => any>(),
  credential: vi.fn(),
  quitting: vi.fn(),
  cleanup: vi.fn(),
  windows: [] as any[],
  updater: {
    setFeedURL: vi.fn(),
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn(),
    on: vi.fn(),
    logger: null as any,
    autoDownload: true,
    autoInstallOnAppQuit: true,
    allowPrerelease: true
  }
}));
vi.mock('electron', () => ({
  app: { isPackaged: true, getVersion: () => '0.1.3' },
  BrowserWindow: { getAllWindows: () => mocks.windows },
  ipcMain: { handle: (key: string, cb: (...args: any[]) => any) => mocks.handlers.set(key, cb) },
  shell: { openExternal: vi.fn() }
}));
vi.mock('../src/main/modules/window', () => ({ setAppQuitting: mocks.quitting }));
vi.mock('../src/main/modules/lxMusicHttp', () => ({ cleanupLxMusicHttp: mocks.cleanup }));
vi.mock('electron-updater', () => ({ default: { autoUpdater: mocks.updater } }));
vi.mock('../src/main/modules/githubUpdateAuth', () => ({
  getGithubUpdateCredential: mocks.credential
}));

describe('private update lifecycle', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.windows.length = 0;
    mocks.handlers.clear();
    mocks.listeners.clear();
    mocks.updater.on.mockImplementation((name, cb) => {
      mocks.listeners.set(name, cb);
    });
    mocks.credential.mockResolvedValue('test-secret');
    mocks.updater.checkForUpdates.mockImplementation(async () => {
      mocks.listeners.get('update-available')?.({ version: '0.1.4', releaseNotes: 'notes' });
    });
    const { setupUpdateHandlers } = await import('../src/main/modules/update');
    setupUpdateHandlers({ webContents: { once: vi.fn() } } as any);
  });
  it('checks a private feed without exposing the credential in UI state', async () => {
    const state = await mocks.handlers.get('app-update:check')!({}, { manual: true });
    expect(state.status).toBe('available');
    expect(state.availableVersion).toBe('0.1.4');
    expect(JSON.stringify(state)).not.toContain('test-secret');
    expect(mocks.updater.setFeedURL).toHaveBeenCalledWith(
      expect.objectContaining({ private: true, token: 'test-secret' })
    );
    expect(mocks.updater.autoDownload).toBe(false);
    expect(mocks.updater.autoInstallOnAppQuit).toBe(false);
  });
  it('returns an actionable failure without leaking the credential', async () => {
    mocks.credential.mockRejectedValueOnce(new Error('无法读取 GitHub CLI 登录凭据。'));
    const state = await mocks.handlers.get('app-update:check')!({}, { manual: true });
    expect(state.status).toBe('error');
    expect(state.errorMessage).toContain('GitHub CLI');
    expect(mocks.updater.checkForUpdates).not.toHaveBeenCalled();
  });
  it('downloads only after approval and installs only after the download event', async () => {
    await mocks.handlers.get('app-update:check')!({}, { manual: true });
    expect(mocks.updater.downloadUpdate).not.toHaveBeenCalled();
    mocks.updater.downloadUpdate.mockImplementationOnce(async () => {
      mocks.listeners.get('download-progress')?.({
        percent: 50,
        transferred: 50,
        total: 100,
        bytesPerSecond: 20
      });
      mocks.listeners.get('update-downloaded')?.({ version: '0.1.4', files: [{ size: 100 }] });
    });
    const state = await mocks.handlers.get('app-update:download')!();
    expect(state.status).toBe('downloaded');
    expect(state.downloadProgress).toBe(100);
    const window = { removeAllListeners: vi.fn(), close: vi.fn(), webContents: { on: vi.fn() } };
    mocks.windows.push(window);
    expect(await mocks.handlers.get('app-update:quit-and-install')!()).toBe(true);
    expect(mocks.quitting).toHaveBeenCalledWith(true);
    expect(mocks.cleanup).toHaveBeenCalledOnce();
    expect(window.close).toHaveBeenCalledOnce();
    expect(mocks.updater.quitAndInstall).toHaveBeenCalledOnce();
  });
  it('can retry after a temporary failure', async () => {
    mocks.credential.mockRejectedValueOnce(new Error('无法读取 GitHub CLI 登录凭据。'));
    expect((await mocks.handlers.get('app-update:check')!({}, { manual: true })).status).toBe(
      'error'
    );
    expect((await mocks.handlers.get('app-update:check')!({}, { manual: true })).status).toBe(
      'available'
    );
  });
  it('does not install until an update has finished downloading', async () => {
    expect(await mocks.handlers.get('app-update:quit-and-install')!()).toBe(false);
    expect(mocks.updater.quitAndInstall).not.toHaveBeenCalled();
  });
  it('redacts errors emitted by the updater', async () => {
    mocks.listeners.get('error')?.(new Error('test-secret'));
    const state = await mocks.handlers.get('app-update:get-state')!();
    expect(JSON.stringify(state)).not.toContain('test-secret');
  });
});
