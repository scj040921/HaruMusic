import { Capacitor } from '@capacitor/core';
import { Nodejs } from '@capawesome/capacitor-nodejs';

const API_PORT = 30488;
const START_TIMEOUT_MS = 30000;

let apiBaseUrlPromise: Promise<string> | undefined;

function isAndroidNativeApp(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

async function probePort(port: number, timeoutMs = 800): Promise<boolean> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/__health`, {
      method: 'GET',
      credentials: 'include',
      signal: controller.signal
    });
    if (!response.ok) return false;
    const body = (await response.json()) as { service?: string };
    return body.service === 'harumusic';
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function waitForExistingApi(): Promise<boolean> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await probePort(API_PORT, 500)) return true;
    await new Promise((resolve) => window.setTimeout(resolve, 250));
  }
  return false;
}

function createApiReadyWaiter() {
  let resolve!: (port: number) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<number>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(message)), START_TIMEOUT_MS);
    promise.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

async function startEmbeddedApi(): Promise<string> {
  if (await probePort(API_PORT, 250)) return `http://127.0.0.1:${API_PORT}`;

  const runtime = await Nodejs.isReady();
  if (runtime.ready) {
    // The runtime is single-instance, so it cannot be restarted after a renderer reload.
    if (await waitForExistingApi()) return `http://127.0.0.1:${API_PORT}`;
    throw new Error('Android 本地音乐服务未能恢复；请完全关闭后重新打开应用。');
  }

  const ready = createApiReadyWaiter();
  const listener = await Nodejs.addListener('message', (event) => {
    if (event.eventName === 'api-ready') {
      const port = Number(event.args[0]);
      if (Number.isInteger(port) && port > 0 && port <= 65535) ready.resolve(port);
    } else if (event.eventName === 'api-error') {
      ready.reject(new Error(String(event.args[0] || 'Android 本地音乐服务启动失败。')));
    }
  });

  try {
    await withTimeout(
      Nodejs.start({ script: 'server.cjs' }),
      'Android 本地音乐服务启动超时，请重新打开应用。'
    );
    const port = await withTimeout(
      ready.promise,
      'Android 本地音乐服务没有响应，请检查应用存储空间后重试。'
    );
    if (port !== API_PORT) {
      throw new Error(`Android 本地音乐服务返回了意外端口：${port}。`);
    }
    if (!(await probePort(port))) {
      throw new Error('Android 本地音乐服务已启动，但健康检查未通过。');
    }
    return `http://127.0.0.1:${port}`;
  } finally {
    await listener.remove();
  }
}

/** Start the embedded Android API once and return its loopback base URL. */
export function getAndroidEmbeddedApiBaseUrl(): Promise<string> {
  if (!isAndroidNativeApp()) return Promise.resolve('');
  if (!apiBaseUrlPromise) {
    apiBaseUrlPromise = startEmbeddedApi().catch((error) => {
      apiBaseUrlPromise = undefined;
      throw error;
    });
  }
  return apiBaseUrlPromise;
}
