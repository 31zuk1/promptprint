import type { NormalizedConversation } from '../domain/models';
import { IndexedDbPrivateStore } from './store';
import type { PrivateStore } from './store';
import { normalizePrivateDetail } from './normalize';
import { emptyPrivateSnapshot, privateNamespace, PrivateTransportError, PRIVATE_TARGETS } from './models';
import type {
  PrivateCheckpoint, PrivateConversationRecord, PrivateIdentity, PrivateListItem, PrivateListPage, PrivateOrder,
  PrivatePhase, PrivateQueueItem, PrivateSyncSnapshot, PrivateTarget, PrivateTransport,
} from './models';

interface PrivateSyncOptions {
  transport: PrivateTransport;
  expectedEmail: string;
  store?: PrivateStore;
  now?: () => number;
  sleep?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  requestIntervalMs?: number;
  normalize?: (input: unknown, item: PrivateListItem, namespace: string, fetchedAt: number) =>
    Promise<PrivateConversationRecord>;
}
export const PRIVATE_SYNC_LOCK = 'promptprint-private-data-v1';
export const PRIVATE_CLEAR_BROADCAST = 'clear-private-data-v1';
const CLEAR_LOCK_TIMEOUT_MS = 15_000;
const abortError = (): DOMException => new DOMException('停止しました。', 'AbortError');
const abortableResult = <T>(operation: Promise<T>, signal: AbortSignal): Promise<T> => new Promise((resolve, reject) => {
  const abort = () => { signal.removeEventListener('abort', abort); reject(abortError()); };
  signal.addEventListener('abort', abort, { once: true });
  void operation.then((value) => {
    signal.removeEventListener('abort', abort);
    if (signal.aborted) abort();
    else resolve(value);
  }, (error: unknown) => {
    signal.removeEventListener('abort', abort);
    if (signal.aborted) abort();
    else reject(error);
  });
  if (signal.aborted) abort();
});
const sleepChunk = (milliseconds: number, signal: AbortSignal): Promise<void> => new Promise((resolve, reject) => {
  if (signal.aborted) { reject(abortError()); return; }
  const onAbort = () => { clearTimeout(timer); reject(abortError()); };
  const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, milliseconds);
  signal.addEventListener('abort', onAbort, { once: true });
});
const abortableSleep = async (milliseconds: number, signal: AbortSignal): Promise<void> => {
  // Long Retry-After values must not overflow setTimeout and accidentally retry immediately.
  let remaining = Math.max(0, milliseconds);
  do {
    const chunk = Math.min(60_000, remaining);
    await sleepChunk(chunk, signal);
    remaining -= chunk;
  } while (remaining > 0);
};
const safeIdentity = (identity: PrivateIdentity): PrivateIdentity => ({
  accountId: identity.accountId, workspaceId: identity.workspaceId,
  email: identity.email, plan: identity.plan, personal: identity.personal,
});
const queueItem = (item: PrivateListItem): PrivateQueueItem => ({
  id: item.id, updatedAt: item.updatedAt, createdAt: item.createdAt,
  state: 'pending', attempts: 0, messageCount: 0, errorCode: null,
  diagnostics: { skippedMessages: 0, truncatedConversations: 0 },
});
const noticeFor = (phase: PrivatePhase): string => ({
  idle: '個人用の取得はまだ開始していません。', connecting: '本人の個人アカウントを確認しています。',
  listing: '取得対象の会話一覧を確認しています。', fetching: '会話本文を端末内へ取得しています。',
  waiting: '元サービスの待機指示または一時障害のため待機しています。',
  paused: '停止しました。取得済みの本文と進捗は端末内に保存されています。',
  'auth-required': '認証接続待ちです。ChatGPTに通常どおりログインしてから再開してください。',
  blocked: 'アクセス拒否またはアカウント不一致のため停止しました。制限の回避は行いません。',
  complete: '指定した取得範囲の処理が終了しました。失敗・未取得件数と取得範囲を確認してください。',
  error: '取得を中断しました。保存容量・接続・取得範囲を確認して再開してください。',
}[phase]);

// This allowlist is deliberately independent of provider response text and arbitrary Error.message/code.
const safeDiagnosticCode = (error: unknown): string => {
  if (!(error instanceof PrivateTransportError)) return 'LOCAL_OR_NETWORK_ERROR';
  const codes: Record<string, string> = {
    IDENTITY_MISMATCH: 'LOCAL_ACCOUNT_VALIDATION',
    'account-changed': 'ACCOUNT_CHANGED',
    'personal-workspace-ambiguous': 'PERSONAL_WORKSPACE_AMBIGUOUS',
    'personal-workspace-unverified': 'PERSONAL_WORKSPACE_UNVERIFIED',
    'identity-required': 'IDENTITY_REQUIRED',
    'identity-schema': 'IDENTITY_SCHEMA',
    'accounts-schema': 'ACCOUNTS_SCHEMA',
    'authentication-required': 'AUTHENTICATION_REQUIRED',
    'chatgpt-tab-required': 'CHATGPT_TAB_REQUIRED',
    'extension-required': 'EXTENSION_REQUIRED',
    'browser-connection': 'BROWSER_CONNECTION',
    'challenge-or-non-json': 'CHALLENGE_OR_NON_JSON',
    'wrong-origin': 'WRONG_ORIGIN',
    LIST_PAGINATION_INVALID: 'LIST_PAGINATION_INVALID',
    LIST_WORK_LIMIT: 'LIST_WORK_LIMIT',
    DETAIL_PAGINATION_UNSUPPORTED: 'DETAIL_PAGINATION_UNSUPPORTED',
    DETAIL_NO_VISIBLE_TEXT: 'DETAIL_NO_VISIBLE_TEXT',
    DETAIL_SHAPE: 'DETAIL_SHAPE',
    DETAIL_ID_MISMATCH: 'DETAIL_ID_MISMATCH',
    DETAIL_NODE_LIMIT: 'DETAIL_NODE_LIMIT',
    NORMALIZED_BODY_INVALID: 'NORMALIZED_BODY_INVALID',
  };
  if (Object.hasOwn(codes, error.code)) return codes[error.code]!;
  if (error.status === 401) return 'HTTP_401';
  if (error.status === 403) return 'HTTP_403';
  if (error.status === 429) return 'HTTP_429';
  return 'ACQUISITION_ERROR';
};

export class PrivateSyncController {
  private readonly store: PrivateStore;
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  private snapshot: PrivateSyncSnapshot = emptyPrivateSnapshot();
  private checkpoint: PrivateCheckpoint | null = null;
  private listeners = new Set<(snapshot: PrivateSyncSnapshot) => void>();
  private generation = 0;
  private abortController: AbortController | null = null;
  private running: Promise<void> | null = null;
  private clearing: Promise<void> | null = null;
  private attemptsSinceIdentity = 0;
  private identityCheckedAt = 0;
  private cached = new Map<string, PrivateQueueItem>();
  private broadcast: BroadcastChannel | null = null;

  constructor(private readonly options: PrivateSyncOptions) {
    this.store = options.store ?? new IndexedDbPrivateStore();
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? abortableSleep;
  }
  getSnapshot = (): PrivateSyncSnapshot => this.snapshot;
  subscribe = (listener: (snapshot: PrivateSyncSnapshot) => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private connectCoordination(): void {
    if (this.broadcast || typeof BroadcastChannel === 'undefined' || !navigator.locks) return;
    this.broadcast = new BroadcastChannel(PRIVATE_SYNC_LOCK);
    this.broadcast.onmessage = (event: MessageEvent<unknown>) => {
      if (event.data !== PRIVATE_CLEAR_BROADCAST) return;
      this.generation += 1;
      this.abortController?.abort();
      this.checkpoint = null;
      this.cached.clear();
      this.running = null;
      this.snapshot = emptyPrivateSnapshot();
      this.publish('idle', '別の個人用タブで全消去が開始されました。（OTHER_TAB_CLEARED）');
    };
  }

  /** Call after pause when replacing/unmounting a private controller. */
  dispose(): void {
    this.generation += 1;
    this.abortController?.abort();
    this.broadcast?.close();
    this.broadcast = null;
    this.checkpoint = null;
    this.cached.clear();
    this.listeners.clear();
  }

  private publish(phase: PrivatePhase, notice = noticeFor(phase), retryAt: number | null = null): void {
    const checkpoint = this.checkpoint;
    if (checkpoint) {
      checkpoint.phase = phase;
      checkpoint.updatedAt = this.now();
      const selected = checkpoint.items.slice(0, checkpoint.target);
      const done = selected.filter(({ state }) => state === 'done');
      const failed = selected.filter(({ state }) => state === 'failed');
      const scope = checkpoint.listExhausted ? selected.length
        : Math.min(checkpoint.target, checkpoint.totalAvailable ?? checkpoint.target);
      this.snapshot = {
        phase, target: checkpoint.target, namespace: checkpoint.namespace, identity: checkpoint.identity,
        listedCount: selected.length, fetchedCount: done.length, failedCount: failed.length,
        messageCount: done.reduce((sum, item) => sum + item.messageCount, 0),
        pendingCount: Math.max(0, scope - done.length - failed.length),
        totalAvailable: checkpoint.totalAvailable, listExhausted: checkpoint.listExhausted,
        order: checkpoint.order, startedAt: checkpoint.startedAt, updatedAt: checkpoint.updatedAt,
        retryAt, notice, revision: checkpoint.revision,
        diagnostics: {
          skippedMessages: done.reduce((sum, item) => sum + item.diagnostics.skippedMessages, 0),
          truncatedConversations: done.reduce((sum, item) => sum + item.diagnostics.truncatedConversations, 0),
        },
      };
    } else this.snapshot = { ...this.snapshot, phase, notice, retryAt };
    for (const listener of this.listeners) listener(this.snapshot);
  }

  private assertCurrent(generation: number): void {
    if (generation !== this.generation || this.abortController?.signal.aborted) throw abortError();
  }
  private async verifyIdentity(generation: number): Promise<PrivateIdentity> {
    const signal = this.abortController!.signal;
    const identity = safeIdentity(await abortableResult(this.options.transport.identity(signal), signal));
    this.assertCurrent(generation);
    if (!identity.personal || !identity.accountId || !identity.workspaceId ||
        identity.email.toLowerCase() !== this.options.expectedEmail.trim().toLowerCase() ||
        (this.checkpoint && privateNamespace(identity) !== this.checkpoint.namespace)) {
      throw new PrivateTransportError('IDENTITY_MISMATCH', 403);
    }
    this.identityCheckedAt = this.now();
    this.attemptsSinceIdentity = 0;
    return identity;
  }

  /** Restores this explicitly authorized account's saved result without requesting new data. */
  async restore(): Promise<void> {
    if (this.running || this.clearing) return;
    this.connectCoordination();
    const generation = this.generation;
    const checkpoint = await this.store.loadLastCheckpoint();
    if (generation !== this.generation || !checkpoint) return;
    if (checkpoint.identity.email.toLowerCase() !== this.options.expectedEmail.trim().toLowerCase() ||
        !checkpoint.identity.personal || checkpoint.namespace !== privateNamespace(checkpoint.identity)) {
      this.publish('blocked'); return;
    }
    this.checkpoint = checkpoint;
    this.publish(checkpoint.phase === 'complete' ? 'complete' : 'paused',
      '端末内に保存された結果です。取得再開時にログイン中の本人アカウントを再確認します。');
  }
  loadConversations(): Promise<NormalizedConversation[]> {
    return this.checkpoint ? this.store.listConversations(this.checkpoint.namespace) : Promise.resolve([]);
  }
  start(target: PrivateTarget): Promise<void> {
    if (!PRIVATE_TARGETS.includes(target)) return Promise.reject(new Error('取得件数を選び直してください。'));
    return this.launch(target, false);
  }
  resume(): Promise<void> { return this.launch(this.checkpoint?.target ?? 1000, false); }
  probe(): Promise<void> { return this.launch(this.checkpoint?.target ?? 1000, true); }

  private launch(target: PrivateTarget, probe: boolean): Promise<void> {
    if (this.running) return this.running;
    if (this.clearing) return this.clearing.then(() => this.launch(target, probe));
    const generation = ++this.generation;
    this.abortController = new AbortController();
    this.connectCoordination();
    const job = this.runExclusively(target, probe, generation);
    this.running = job;
    void job.then(() => { if (this.running === job) this.running = null; }, () => {
      if (this.running === job) this.running = null;
    });
    return job;
  }

  private async runExclusively(target: PrivateTarget, probe: boolean, generation: number): Promise<void> {
    if (!navigator.locks) { await this.run(target, probe, generation); return; }
    try {
      await navigator.locks.request(PRIVATE_SYNC_LOCK, { ifAvailable: true }, async (lock) => {
        if (generation !== this.generation) return;
        if (!lock) {
          this.publish('blocked', '別の個人用タブが取得または消去中です。そのタブを停止してから再開してください。（OTHER_PRIVATE_TAB）');
          return;
        }
        await this.run(target, probe, generation);
      });
    } catch {
      if (generation === this.generation) this.publish('error', '個人用タブの排他制御を開始できませんでした。（LOCAL_LOCK_ERROR）');
    }
  }

  private async save(generation: number): Promise<void> {
    this.assertCurrent(generation);
    if (this.checkpoint) await this.store.saveCheckpoint(this.checkpoint,
      () => generation === this.generation && !this.abortController?.signal.aborted);
    this.assertCurrent(generation);
  }

  private async request<T>(operation: () => Promise<T>, generation: number): Promise<T> {
    const signal = this.abortController!.signal;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      this.assertCurrent(generation);
      if (this.attemptsSinceIdentity >= 10 || this.now() - this.identityCheckedAt >= 60_000) {
        await this.verifyIdentity(generation);
      }
      try {
        this.attemptsSinceIdentity += 1;
        const result = await operation();
        this.assertCurrent(generation);
        return result;
      } catch (error) {
        this.assertCurrent(generation);
        if (error instanceof PrivateTransportError &&
            (error.status === 401 || error.status === 403 ||
             (error.status !== null && error.status >= 400 && error.status < 500 && error.status !== 429))) throw error;
        if (attempt === 3) throw error;
        const retryAfter = error instanceof PrivateTransportError ? error.retryAfterMs : null;
        const wait = Math.max(1000 * 2 ** attempt, Number.isFinite(retryAfter) && retryAfter !== null ? retryAfter : 0);
        this.publish('waiting', noticeFor('waiting'), this.now() + wait);
        await this.save(generation);
        await this.sleep(wait, signal);
      }
    }
    throw new PrivateTransportError('RETRY_LIMIT');
  }

  private async run(target: PrivateTarget, probe: boolean, generation: number): Promise<void> {
    try {
      this.publish('connecting');
      const identity = await this.verifyIdentity(generation);
      // Re-read under the cross-tab lock; an idle tab must not revive a checkpoint cleared elsewhere.
      this.checkpoint = await this.store.loadCheckpoint(privateNamespace(identity));
      this.assertCurrent(generation);
      if (this.checkpoint && this.checkpoint.namespace !== privateNamespace(identity)) {
        throw new PrivateTransportError('IDENTITY_MISMATCH', 403);
      }
      if (!this.checkpoint || (this.checkpoint.phase === 'complete' && !probe)) {
        this.cached = new Map(this.checkpoint?.items.filter(({ state }) => state === 'done').map((item) => [item.id, item]));
        this.checkpoint = {
          version: 1, namespace: privateNamespace(identity), identity, target,
          items: [], cursor: null, seenCursors: [], listExhausted: false, totalAvailable: null,
          order: 'unknown', startedAt: this.now(), updatedAt: this.now(), phase: 'listing',
          // Revision identifies the selected stored corpus, not just network successes.
          // A fresh listing can replace/remove previously selected conversations.
          revision: (this.checkpoint?.revision ?? 0) + 1,
        };
      } else {
        if (this.checkpoint.target !== target) this.checkpoint.revision += 1;
        this.checkpoint.target = target;
        // A new, explicit resume permits another bounded attempt for failed bodies.
        for (const item of this.checkpoint.items) if (item.state === 'failed') {
          item.state = 'pending'; item.attempts = 0; item.errorCode = null;
        }
      }
      await this.save(generation);
      const initiallyDone = this.checkpoint.items.filter(({ state }) => state === 'done').length;
      while (true) {
        this.assertCurrent(generation);
        const checkpoint: PrivateCheckpoint = this.checkpoint;
        const selected = checkpoint.items.slice(0, target);
        const pending = selected.find(({ state }) => state === 'pending');
        if (probe && selected.filter(({ state }) => state === 'done').length >= Math.max(3, initiallyDone)) {
          this.publish('paused', '接続確認として会話一覧と本文3件を保存しました。取得開始で続きへ進めます。');
          await this.save(generation); return;
        }
        if (!pending) {
          if (selected.length >= target || checkpoint.listExhausted) {
            this.publish('complete'); await this.save(generation); return;
          }
          this.publish('listing');
          const page: PrivateListPage = await this.request(() => this.options.transport.list(checkpoint.cursor, this.abortController!.signal), generation);
          if (!Array.isArray(page.items) || page.items.length > 1000 ||
              (page.nextCursor !== null && (page.nextCursor === checkpoint.cursor || checkpoint.seenCursors.includes(page.nextCursor)))) {
            throw new PrivateTransportError('LIST_PAGINATION_INVALID');
          }
          if (page.items.length > 0) {
            let observedOrder: PrivateOrder = page.order;
            if (checkpoint.items.length > 0) {
              if (checkpoint.order === 'unknown' || observedOrder !== checkpoint.order) observedOrder = 'unknown';
              else {
                const dateKey = observedOrder === 'created' ? 'createdAt' : 'updatedAt';
                const previousDate = checkpoint.items.at(-1)?.[dateKey];
                const firstDate = page.items[0]?.[dateKey];
                if (previousDate === null || previousDate === undefined || firstDate === null ||
                    firstDate === undefined || previousDate < firstDate) observedOrder = 'unknown';
              }
            }
            checkpoint.order = observedOrder;
          }
          const known = new Map(checkpoint.items.map((item) => [item.id, item]));
          let selectedCorpusChanged = false;
          for (const item of page.items) {
            if (typeof item.id !== 'string' || !item.id || item.id.length > 512) throw new PrivateTransportError('LIST_ITEM_INVALID');
            const previous = known.get(item.id);
            if (previous) {
              if (item.updatedAt !== null && previous.updatedAt !== item.updatedAt) {
                if (previous.state === 'done') selectedCorpusChanged = true;
                Object.assign(previous, queueItem(item));
              }
              continue;
            }
            const cached = this.cached.get(item.id);
            const next = cached && item.updatedAt !== null && cached.updatedAt === item.updatedAt
              ? { ...cached } : queueItem(item);
            if (next.state === 'done') selectedCorpusChanged = true;
            checkpoint.items.push(next); known.set(item.id, next);
          }
          if (selectedCorpusChanged) checkpoint.revision += 1;
          if (checkpoint.cursor !== null) checkpoint.seenCursors.push(checkpoint.cursor);
          checkpoint.cursor = page.nextCursor;
          checkpoint.listExhausted = page.nextCursor === null;
          checkpoint.totalAvailable = typeof page.total === 'number' && Number.isSafeInteger(page.total) && page.total >= 0 ? page.total : null;
          // Empty terminal pages contain no new ordering evidence. Preserve the
          // cross-page verdict instead of replacing it with that empty page's unknown.
          if (checkpoint.seenCursors.length > 10_000 || checkpoint.items.length > 5000) throw new PrivateTransportError('LIST_WORK_LIMIT');
          await this.save(generation);
          await this.sleep(this.options.requestIntervalMs ?? 750, this.abortController!.signal);
          continue;
        }
        this.publish('fetching');
        try {
          const detail = await this.request(() => {
            pending.attempts += 1;
            return this.options.transport.detail(pending.id, this.abortController!.signal);
          }, generation);
          const record = this.options.normalize
            ? await this.options.normalize(detail, pending, checkpoint.namespace, this.now())
            : normalizePrivateDetail(detail, pending, checkpoint.namespace, this.now());
          this.assertCurrent(generation);
          if (record.id !== pending.id || record.conversation.messages.length === 0) throw new PrivateTransportError('NORMALIZED_BODY_INVALID');
          const committed: PrivateCheckpoint = {
            ...checkpoint, revision: checkpoint.revision + 1, updatedAt: this.now(),
            items: checkpoint.items.map((item) => item === pending ? {
              ...item, state: 'done', messageCount: record.conversation.messages.length,
              diagnostics: record.diagnostics, errorCode: null,
            } : item),
          };
          const saved = await this.store.saveConversation(checkpoint.namespace, record, committed,
            () => generation === this.generation && !this.abortController?.signal.aborted);
          this.assertCurrent(generation);
          if (!saved) throw abortError();
          this.checkpoint = committed;
        } catch (error) {
          this.assertCurrent(generation);
          if (error instanceof PrivateTransportError && (error.status === 401 || error.status === 403 || error.status === 429)) throw error;
          pending.state = 'failed'; pending.messageCount = 0;
          pending.errorCode = safeDiagnosticCode(error);
          await this.save(generation);
        }
        this.publish('fetching');
        await this.sleep(this.options.requestIntervalMs ?? 750, this.abortController!.signal);
      }
    } catch (error) {
      if (generation !== this.generation) return;
      if (this.abortController?.signal.aborted) return;
      const phase = error instanceof PrivateTransportError
        ? error.status === 401 ? 'auth-required' : error.status === 403 ? 'blocked' : 'error'
        : 'error';
      this.publish(phase, `${noticeFor(phase)}（診断: ${safeDiagnosticCode(error)}）`);
      if (this.checkpoint) {
        try { await this.store.saveCheckpoint(this.checkpoint, () => generation === this.generation); }
        catch { this.publish('error', '端末内保存に失敗しました。空き容量を確認してください。'); }
      }
    }
  }

  async pause(): Promise<void> {
    this.generation += 1;
    this.abortController?.abort();
    this.publish('paused');
    const generation = this.generation;
    const savePaused = async (): Promise<void> => {
      if (this.checkpoint) await this.store.saveCheckpoint(this.checkpoint, () => generation === this.generation);
    };
    if (navigator.locks) {
      // Each completed body/page is already checkpointed. If a run/clear owns the lock,
      // skip this optional phase-only write rather than racing a cross-tab deletion.
      await navigator.locks.request(PRIVATE_SYNC_LOCK, { ifAvailable: true }, async (lock) => {
        if (lock) await savePaused();
      });
    } else await savePaused();
    this.running = null;
  }

  clear(): Promise<void> {
    if (this.clearing) return this.clearing;
    this.generation += 1;
    this.abortController?.abort();
    this.checkpoint = null;
    this.cached.clear();
    this.running = null;
    this.snapshot = emptyPrivateSnapshot();
    this.publish('idle', '個人用の本文と取得進捗を消去しています。');
    this.connectCoordination();
    this.broadcast?.postMessage(PRIVATE_CLEAR_BROADCAST);
    const clearUnderLock = async (): Promise<void> => {
      if (!navigator.locks) { await this.store.clearAll(); return; }
      const abort = new AbortController();
      const timeout = setTimeout(() => abort.abort(), CLEAR_LOCK_TIMEOUT_MS);
      try {
        await navigator.locks.request(PRIVATE_SYNC_LOCK, { signal: abort.signal }, async () => {
          await this.store.clearAll();
        });
      } finally { clearTimeout(timeout); }
    };
    const job = clearUnderLock().then(() => {
      this.publish('idle', '個人用の本文と取得進捗を全消去しました。');
    }, () => {
      this.publish('error', '端末内データを消去できませんでした。別の個人用タブを閉じ、保存領域を確認してから再試行してください。');
      throw new Error('端末内データの全消去を確認できませんでした。');
    }).finally(() => { this.clearing = null; });
    this.clearing = job;
    return job;
  }
}
