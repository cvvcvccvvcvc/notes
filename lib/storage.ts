import type { AppData } from '@/lib/data';
import type { SyncEnvelope } from '@/lib/sync';

const DATABASE = 'notes-prototype';
const DATABASE_VERSION = 2;
const STORE = 'app';
const ATTACHMENT_STORE = 'note-attachments';
const ENVELOPE_KEY = 'sync-envelope';
const LEGACY_DATA_KEY = 'main';

let databasePromise: Promise<IDBDatabase> | null = null;
let writeQueue = Promise.resolve();

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE))
        request.result.createObjectStore(STORE);
      if (!request.result.objectStoreNames.contains(ATTACHMENT_STORE))
        request.result.createObjectStore(ATTACHMENT_STORE);
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
  });
  return databasePromise;
}

function readKey<T>(database: IDBDatabase, key: string) {
  return new Promise<T | null>((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readonly');
    const request = transaction.objectStore(STORE).get(key);
    request.onsuccess = () =>
      resolve((request.result as T | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function loadEnvelope(): Promise<SyncEnvelope | null> {
  const database = await openDatabase();
  const envelope = await readKey<SyncEnvelope>(database, ENVELOPE_KEY);
  if (envelope) return envelope;

  const legacyData = await readKey<AppData>(database, LEGACY_DATA_KEY);
  if (!legacyData) return null;
  return {
    data: legacyData,
    sync: {
      schemaVersion: 1,
      baseRevision: null,
      base: null,
      dirty: true,
    },
  };
}

function writeEnvelope(envelope: SyncEnvelope) {
  return openDatabase().then(
    (database) =>
      new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STORE, 'readwrite');
        transaction.objectStore(STORE).put(envelope, ENVELOPE_KEY);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      }),
  );
}

export function saveEnvelope(envelope: SyncEnvelope) {
  const snapshot = structuredClone(envelope);
  const write = writeQueue.then(() => writeEnvelope(snapshot));
  writeQueue = write.catch(() => undefined);
  return write;
}

export type StoredNoteAttachment = {
  blob: Blob;
  uploaded: boolean;
};

export async function loadStoredNoteAttachment(id: string) {
  const database = await openDatabase();
  return new Promise<StoredNoteAttachment | null>((resolve, reject) => {
    const transaction = database.transaction(ATTACHMENT_STORE, 'readonly');
    const request = transaction.objectStore(ATTACHMENT_STORE).get(id);
    request.onsuccess = () =>
      resolve((request.result as StoredNoteAttachment | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function saveStoredNoteAttachment(
  id: string,
  attachment: StoredNoteAttachment,
) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(ATTACHMENT_STORE, 'readwrite');
    transaction.objectStore(ATTACHMENT_STORE).put(attachment, id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function markStoredNoteAttachmentUploaded(id: string) {
  const attachment = await loadStoredNoteAttachment(id);
  if (!attachment || attachment.uploaded) return;
  await saveStoredNoteAttachment(id, { ...attachment, uploaded: true });
}
