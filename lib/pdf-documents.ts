export interface StoredPdfDocument {
  hash: string;
  bytes: Blob;
  title: string;
  size: number;
  savedAt: string;
  sourceUrl?: string;
}
export type PdfDocumentMetadata = Omit<StoredPdfDocument, 'bytes'>;
const DB = 'anchorNotesPdfDocuments';

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('documents', { keyPath: 'hash' });
      request.result.createObjectStore('metadata', { keyPath: 'hash' });
      request.result.createObjectStore('sources');
    };
    request.onerror = () => reject(request.error || new Error('PDF storage unavailable.'));
    request.onblocked = () => reject(new Error('Close other Anchor Notes pages and try again.'));
    request.onsuccess = () => resolve(request.result);
  });
}

async function transact<T>(
  stores: string[],
  mode: IDBTransactionMode,
  run: (tx: IDBTransaction, result: (value: T) => void) => void,
): Promise<T> {
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      let result: T;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error || new Error('PDF storage transaction failed.'));
      tx.onerror = () => undefined; // onabort is the transaction's final failure.
      try {
        run(tx, (value) => {
          result = value;
        });
      } catch (error) {
        tx.abort();
        reject(error);
      }
    });
  } finally {
    db.close();
  }
}

export async function keepPdfDocument(input: {
  hash: string;
  bytes: Blob;
  title: string;
  sourceUrl?: string;
}): Promise<void> {
  if (!/^[a-f0-9]{64}$/.test(input.hash) || !input.bytes.size) throw new Error('Invalid PDF document.');
  await transact<void>(['documents', 'metadata', 'sources'], 'readwrite', (tx) => {
    const metadata: PdfDocumentMetadata = {
      hash: input.hash,
      title: input.title,
      size: input.bytes.size,
      savedAt: new Date().toISOString(),
      sourceUrl: input.sourceUrl,
    };
    tx.objectStore('documents').put({ hash: input.hash, bytes: input.bytes });
    tx.objectStore('metadata').put(metadata);
    if (input.sourceUrl) tx.objectStore('sources').put(input.hash, input.sourceUrl);
  });
  announceChange();
}
export async function readPdfDocument(hash: string): Promise<StoredPdfDocument | undefined> {
  return transact<StoredPdfDocument | undefined>(['documents', 'metadata'], 'readonly', (tx, done) => {
    const request = tx.objectStore('metadata').get(hash);
    request.onsuccess = () => {
      if (!request.result) {
        done(undefined);
        return;
      }
      const bytes = tx.objectStore('documents').get(hash);
      bytes.onsuccess = () =>
        done(bytes.result ? ({ ...request.result, bytes: bytes.result.bytes } as StoredPdfDocument) : undefined);
    };
  });
}
export async function findPdfDocument(sourceUrl: string): Promise<StoredPdfDocument | undefined> {
  const hash = await transact<string | undefined>(['sources'], 'readonly', (tx, done) => {
    const request = tx.objectStore('sources').get(sourceUrl);
    request.onsuccess = () => done(request.result as string | undefined);
  });
  return hash ? readPdfDocument(hash) : undefined;
}
export async function listPdfDocuments(): Promise<PdfDocumentMetadata[]> {
  return transact<PdfDocumentMetadata[]>(['metadata'], 'readonly', (tx, done) => {
    const request = tx.objectStore('metadata').getAll();
    request.onsuccess = () => done(request.result as PdfDocumentMetadata[]);
  });
}
export async function removePdfDocument(hash: string): Promise<void> {
  await transact<void>(['documents', 'metadata', 'sources'], 'readwrite', (tx) => {
    tx.objectStore('documents').delete(hash);
    tx.objectStore('metadata').delete(hash);
    const cursor = tx.objectStore('sources').openCursor();
    cursor.onsuccess = () => {
      if (!cursor.result) return;
      if (cursor.result.value === hash) cursor.result.delete();
      cursor.result.continue();
    };
  });
  announceChange();
}
function announceChange() {
  const channel = new BroadcastChannel('anchor-pdf-storage');
  channel.postMessage('changed');
  channel.close();
  window.dispatchEvent(new Event('anchor:pdf-storage'));
}

export async function associatePdfSource(sourceUrl: string, hash: string): Promise<void> {
  const changed = await transact<boolean>(['documents', 'sources'], 'readwrite', (tx, done) => {
    const document = tx.objectStore('documents').getKey(hash);
    document.onsuccess = () => {
      if (!document.result) {
        done(false);
        return;
      }
      const source = tx.objectStore('sources').get(sourceUrl);
      source.onsuccess = () => {
        if (source.result === hash) {
          done(false);
          return;
        }
        tx.objectStore('sources').put(hash, sourceUrl);
        done(true);
      };
    };
  });
  if (changed) announceChange();
}
