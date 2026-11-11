import { Capacitor, registerPlugin } from '@capacitor/core';

const DB_NAME = 'harumusic-android-local';
const STORE = 'tracks';
export type AndroidLocalTrack = {
  id: string;
  name: string;
  file?: File;
  uri?: string;
  artist?: string;
  album?: string;
  duration?: number;
  size?: number;
  mimeType?: string;
};

type ScannedFlac = Omit<AndroidLocalTrack, 'file'> & { uri: string };
const nativeLibrary =
  Capacitor.getPlatform() === 'android'
    ? registerPlugin<{
        scanFlac(): Promise<{ tracks: ScannedFlac[] }>;
        copyToCache(options: { uri: string; size?: number }): Promise<{ path: string }>;
        removeCachedFile(options: { uri: string }): Promise<{ removed: boolean }>;
      }>('HaruLocalMusic')
    : null;
const urls = new Map<string, string>();
const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
async function run<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = operation(transaction.objectStore(STORE));
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => {
      db.close();
      resolve(request.result);
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
    transaction.onabort = () => {
      db.close();
      reject(transaction.error);
    };
  });
}
export const listAndroidLocalTracks = () =>
  run<AndroidLocalTrack[]>('readonly', (store) => store.getAll());
export const saveAndroidLocalTrack = (track: AndroidLocalTrack) =>
  run('readwrite', (store) => store.put(track));
export async function saveAndroidLocalTracks(tracks: AndroidLocalTrack[]): Promise<void> {
  if (!tracks.length) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite');
    const store = transaction.objectStore(STORE);
    for (const track of tracks) store.put(track);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  }).finally(() => db.close());
}
export async function removeAndroidLocalTrack(id: string): Promise<void> {
  const track = await run<AndroidLocalTrack | undefined>('readonly', (store) => store.get(id));
  await run('readwrite', (store) => store.delete(id));
  urls.delete(id);
  if (track?.uri && nativeLibrary) {
    await nativeLibrary.removeCachedFile({ uri: track.uri }).catch(() => undefined);
  }
}

export async function scanAndroidFlacTracks(): Promise<ScannedFlac[]> {
  if (!nativeLibrary) throw new Error('設備掃描僅在 Android 版本中可用。');
  const result = await nativeLibrary.scanFlac();
  return Array.isArray(result.tracks) ? result.tracks : [];
}

export async function getAndroidLocalUrl(id: string): Promise<string> {
  const existing = urls.get(id);
  if (existing) return existing;
  const track = await run<AndroidLocalTrack | undefined>('readonly', (store) => store.get(id));
  if (track?.uri && nativeLibrary) {
    const cached = await nativeLibrary.copyToCache({ uri: track.uri, size: track.size });
    const url = Capacitor.convertFileSrc(cached.path);
    urls.set(id, url);
    return url;
  }
  if (!track?.file) throw new Error('本地文件不可用，请重新导入或重新扫描设备。');
  const url = URL.createObjectURL(track.file);
  urls.set(id, url);
  return url;
}
