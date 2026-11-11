const DB_NAME = 'harumusic-android-local';
const STORE = 'tracks';
export type AndroidLocalTrack = { id: string; name: string; file: File };
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
export const removeAndroidLocalTrack = (id: string) =>
  run('readwrite', (store) => store.delete(id));
export async function getAndroidLocalUrl(id: string): Promise<string> {
  const existing = urls.get(id);
  if (existing) return existing;
  const track = await run<AndroidLocalTrack | undefined>('readonly', (store) => store.get(id));
  if (!track?.file) throw new Error('本地文件不可用，请重新导入。');
  const url = URL.createObjectURL(track.file);
  urls.set(id, url);
  return url;
}
