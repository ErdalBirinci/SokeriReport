import type { GlucoseUnit } from './glucose';
import type { TargetProfileId } from './metrics';
import type { ReportPeriod } from './period';
import type { Dataset } from './types';

export interface ArchivePayload {
  dataset: Dataset;
  /** Missing on archives saved before report periods were introduced. */
  period?: ReportPeriod;
  patient: string;
  note: string;
  summaryOverride: string | null;
  profile: TargetProfileId;
  unit: GlucoseUnit;
}

export interface ArchiveSummary {
  id: string;
  label: string;
  createdAt: number;
  source: string;
  fileName: string;
}

interface StoredRecord extends ArchiveSummary {
  salt: string;
  iv: string;
  cipher: string;
}

export interface CipherText {
  salt: string;
  iv: string;
  cipher: string;
}

const DB_NAME = 'sokerireport-archive';
const STORE = 'reports';
const ITERATIONS = 150_000;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptPayload(
  payload: ArchivePayload,
  passphrase: string,
): Promise<CipherText> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  return {
    salt: toBase64(salt),
    iv: toBase64(iv),
    cipher: toBase64(new Uint8Array(encrypted)),
  };
}

export async function decryptPayload<T>(
  record: CipherText,
  passphrase: string,
): Promise<T> {
  const key = await deriveKey(passphrase, fromBase64(record.salt));
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(record.iv) as BufferSource },
    key,
    fromBase64(record.cipher) as BufferSource,
  );
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open the local archive.'));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Archive operation failed.'));
  });
}

export async function listArchives(): Promise<ArchiveSummary[]> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, 'readonly');
    const records = await requestResult(tx.objectStore(STORE).getAll() as IDBRequest<StoredRecord[]>);
    return records
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(({ id, label, createdAt, source, fileName }) => ({ id, label, createdAt, source, fileName }));
  } finally {
    db.close();
  }
}

export async function saveArchive(
  label: string,
  passphrase: string,
  payload: ArchivePayload,
): Promise<ArchiveSummary> {
  const encrypted = await encryptPayload(payload, passphrase);
  const record: StoredRecord = {
    id: crypto.randomUUID(),
    label: label.trim() || payload.dataset.meta.fileName || 'Report',
    createdAt: Date.now(),
    source: payload.dataset.meta.source,
    fileName: payload.dataset.meta.fileName,
    ...encrypted,
  };

  const db = await openDb();
  try {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Could not save the report.'));
      tx.onabort = () => reject(tx.error ?? new Error('Could not save the report.'));
    });
  } finally {
    db.close();
  }

  return {
    id: record.id,
    label: record.label,
    createdAt: record.createdAt,
    source: record.source,
    fileName: record.fileName,
  };
}

export async function loadArchive(id: string, passphrase: string): Promise<ArchivePayload> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, 'readonly');
    const record = await requestResult(
      tx.objectStore(STORE).get(id) as IDBRequest<StoredRecord | undefined>,
    );
    if (!record) throw new Error('That saved report no longer exists.');
    return await decryptPayload<ArchivePayload>(record, passphrase);
  } finally {
    db.close();
  }
}

export async function deleteArchive(id: string): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Could not delete the report.'));
    });
  } finally {
    db.close();
  }
}
