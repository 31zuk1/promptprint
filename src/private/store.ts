import type { NormalizedConversation } from '../domain/models';
import type { PrivateCheckpoint, PrivateConversationRecord } from './models';

export const PRIVATE_DATABASE_NAME = 'promptprint-private-v1';
export interface PrivateStore {
  loadCheckpoint(namespace: string): Promise<PrivateCheckpoint | null>;
  loadLastCheckpoint(): Promise<PrivateCheckpoint | null>;
  saveCheckpoint(checkpoint: PrivateCheckpoint, current?: () => boolean): Promise<boolean>;
  saveConversation(namespace: string, record: PrivateConversationRecord, checkpoint: PrivateCheckpoint,
    current?: () => boolean): Promise<boolean>;
  listConversations(namespace: string): Promise<NormalizedConversation[]>;
  clearAll(): Promise<void>;
}
interface StoredConversation {
  key: string;
  namespace: string;
  record: PrivateConversationRecord;
}
const requestValue = <T>(request: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(new Error('端末内保存を読み書きできませんでした。'));
});
const transactionDone = (transaction: IDBTransaction): Promise<void> => new Promise((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onerror = transaction.onabort = () => reject(new Error('端末内保存に失敗しました。空き容量とブラウザ設定を確認してください。'));
});

/** Lazy opening is essential: importing the ordinary Web build creates no database. */
export class IndexedDbPrivateStore implements PrivateStore {
  private database: Promise<IDBDatabase> | null = null;
  private generation = 0;
  constructor(private readonly name = PRIVATE_DATABASE_NAME) {}

  private open(): Promise<IDBDatabase> {
    if (!this.database) this.database = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.name, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        const conversations = db.createObjectStore('conversations', { keyPath: 'key' });
        conversations.createIndex('namespace', 'namespace');
        db.createObjectStore('checkpoints', { keyPath: 'namespace' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => { this.database = null; reject(new Error('端末内保存を開けませんでした。')); };
      request.onblocked = () => reject(new Error('別の個人用タブを閉じてから再試行してください。'));
    });
    return this.database;
  }

  async loadCheckpoint(namespace: string): Promise<PrivateCheckpoint | null> {
    const db = await this.open();
    return (await requestValue(db.transaction('checkpoints').objectStore('checkpoints')
      .get(namespace) as IDBRequest<PrivateCheckpoint | undefined>)) ?? null;
  }

  async loadLastCheckpoint(): Promise<PrivateCheckpoint | null> {
    const db = await this.open();
    const values = await requestValue(db.transaction('checkpoints').objectStore('checkpoints')
      .getAll() as IDBRequest<PrivateCheckpoint[]>);
    return values.sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
  }

  async saveCheckpoint(checkpoint: PrivateCheckpoint, current = () => true): Promise<boolean> {
    const generation = this.generation;
    const db = await this.open();
    if (generation !== this.generation || !current()) return false;
    const transaction = db.transaction('checkpoints', 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore('checkpoints').put(checkpoint);
    await done;
    return generation === this.generation && current();
  }

  async saveConversation(namespace: string, record: PrivateConversationRecord, checkpoint: PrivateCheckpoint,
    current = () => true): Promise<boolean> {
    if (namespace !== checkpoint.namespace) throw new Error('保存先アカウントが一致しません。');
    const generation = this.generation;
    const db = await this.open();
    if (generation !== this.generation || !current()) return false;
    const transaction = db.transaction(['conversations', 'checkpoints'], 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore('conversations').put({
      key: JSON.stringify([namespace, record.id]), namespace, record,
    } satisfies StoredConversation);
    transaction.objectStore('checkpoints').put(checkpoint);
    await done;
    return generation === this.generation && current();
  }

  async listConversations(namespace: string): Promise<NormalizedConversation[]> {
    const generation = this.generation;
    const db = await this.open();
    const transaction = db.transaction(['checkpoints', 'conversations']);
    // Both reads run in the same transaction; checkpoint and bodies are a consistent snapshot.
    const checkpoint = await requestValue(transaction.objectStore('checkpoints')
      .get(namespace) as IDBRequest<PrivateCheckpoint | undefined>);
    if (!checkpoint || generation !== this.generation) return [];
    const selected = checkpoint.items.slice(0, checkpoint.target).filter(({ state }) => state === 'done');
    const requests = selected.map(({ id }) => requestValue(transaction.objectStore('conversations')
      .get(JSON.stringify([namespace, id])) as IDBRequest<StoredConversation | undefined>));
    const records = await Promise.all(requests);
    if (generation !== this.generation) return [];
    return records.flatMap((entry) => entry ? [entry.record.conversation] : []);
  }

  async clearAll(): Promise<void> {
    this.generation += 1;
    const db = await this.open();
    const transaction = db.transaction(['conversations', 'checkpoints'], 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore('conversations').clear();
    transaction.objectStore('checkpoints').clear();
    await done;
  }
}
