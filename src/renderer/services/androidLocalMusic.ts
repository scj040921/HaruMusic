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
  /** Extracted once from embedded tags and cached with the local library entry. */
  cover?: string;
  lyrics?: string;
  metadataLoaded?: boolean;
};

type ScannedFlac = Omit<AndroidLocalTrack, 'file'> & { uri: string };
const nativeLibrary =
  Capacitor.getPlatform() === 'android'
    ? registerPlugin<{
        scanFlac(): Promise<{ tracks: ScannedFlac[] }>;
        readMetadata(options: { uri: string }): Promise<{ cover?: string; lyrics?: string }>;
        copyToCache(options: { uri: string; size?: number }): Promise<{ path: string }>;
        removeCachedFile(options: { uri: string }): Promise<{ removed: boolean }>;
      }>('HaruLocalMusic')
    : null;
const urls = new Map<string, string>();
const metadataRequests = new Map<string, Promise<{ cover?: string; lyrics?: string }>>();
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

async function loadAndroidLocalMetadata(id: string): Promise<{ cover?: string; lyrics?: string }> {
  const track = await run<AndroidLocalTrack | undefined>('readonly', (store) => store.get(id));
  if (!track) return {};
  if (track.metadataLoaded) return { cover: track.cover, lyrics: track.lyrics };

  let metadata: { cover?: string; lyrics?: string } = {};
  if (track.uri && nativeLibrary) {
    metadata = await nativeLibrary.readMetadata({ uri: track.uri });
  } else if (track.file) {
    // music-metadata's browser entry parses Blob streams without copying a full
    // lossless file into memory, and supports the same common tags as desktop.
    const { parseBlob } = await import('music-metadata');
    const parsed = await parseBlob(track.file);
    const picture = parsed.common.picture?.find((item) => item.data.length <= 3 * 1024 * 1024);
    if (picture) {
      const bytes = new Uint8Array(picture.data);
      let binary = '';
      const chunkSize = 0x8000;
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
      }
      const mime = picture.format?.startsWith('image/') ? picture.format : 'image/jpeg';
      metadata.cover = `data:${mime};base64,${btoa(binary)}`;
    }
    const embeddedLyrics = parsed.common.lyrics?.find((item) => item.text?.trim())?.text;
    if (embeddedLyrics) metadata.lyrics = embeddedLyrics;
  }

  track.cover = metadata.cover;
  track.lyrics = metadata.lyrics;
  track.metadataLoaded = true;
  await saveAndroidLocalTrack(track).catch(() => undefined);
  return metadata;
}

export async function getAndroidLocalMetadata(
  id: string
): Promise<{ cover?: string; lyrics?: string }> {
  const pending = metadataRequests.get(id);
  if (pending) return pending;
  const request = loadAndroidLocalMetadata(id).finally(() => {
    if (metadataRequests.get(id) === request) metadataRequests.delete(id);
  });
  metadataRequests.set(id, request);
  return request;
}
