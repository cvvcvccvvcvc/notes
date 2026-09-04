import type { AppData } from '@/lib/data';

const DATABASE = 'notes-prototype';
const STORE = 'app';
const KEY = 'main';

let databasePromise: Promise<IDBDatabase> | null = null;
let writeQueue = Promise.resolve();

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE))
        request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return databasePromise;
}

export async function loadData(): Promise<AppData | null> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readonly');
    const request = transaction.objectStore(STORE).get(KEY);
    request.onsuccess = () =>
      resolve((request.result as AppData | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

function writeData(data: AppData) {
  return openDatabase().then(
    (database) =>
      new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STORE, 'readwrite');
        transaction.objectStore(STORE).put(data, KEY);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      }),
  );
}

export function saveData(data: AppData) {
  const snapshot = structuredClone(data);
  const write = writeQueue.then(() => writeData(snapshot));
  writeQueue = write.catch(() => undefined);
  return write;
}
