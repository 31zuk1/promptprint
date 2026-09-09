import type { NormalizedConversation } from '../domain/models';

export const PRIVATE_TARGETS = [100, 500, 1000, 3000] as const;
export type PrivateTarget = typeof PRIVATE_TARGETS[number];
export type PrivateOrder = 'updated' | 'created' | 'unknown';
export interface PrivateIdentity {
  accountId: string;
  workspaceId: string;
  email: string;
  plan: string;
  personal: boolean;
}
export interface PrivateListItem {
  id: string;
  updatedAt: number | null;
  createdAt: number | null;
}
export interface PrivateListPage {
  items: PrivateListItem[];
  nextCursor: string | null;
  total: number | null;
  order: PrivateOrder;
}
export interface PrivateTransport {
  identity(signal?: AbortSignal): Promise<PrivateIdentity>;
  list(cursor: string | null, signal: AbortSignal): Promise<PrivateListPage>;
  detail(id: string, signal: AbortSignal): Promise<unknown>;
}

/** Only fixed, non-sensitive diagnostics belong in this error. Never pass response bodies. */
export class PrivateTransportError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number | null = null,
    public readonly retryAfterMs: number | null = null,
  ) {
    super('個人用の取得処理を完了できませんでした。');
    this.name = 'PrivateTransportError';
  }
}

export interface PrivateDiagnostics {
  skippedMessages: number;
  truncatedConversations: number;
}
export interface PrivateConversationRecord extends PrivateListItem {
  fetchedAt: number;
  conversation: NormalizedConversation;
  diagnostics: PrivateDiagnostics;
}
export interface PrivateQueueItem extends PrivateListItem {
  state: 'pending' | 'done' | 'failed';
  attempts: number;
  messageCount: number;
  diagnostics: PrivateDiagnostics;
  errorCode: string | null;
}
export type PrivatePhase = 'idle' | 'connecting' | 'listing' | 'fetching' | 'waiting' |
  'paused' | 'auth-required' | 'blocked' | 'complete' | 'error';
export interface PrivateCheckpoint {
  version: 1;
  namespace: string;
  identity: PrivateIdentity;
  target: PrivateTarget;
  items: PrivateQueueItem[];
  cursor: string | null;
  seenCursors: string[];
  listExhausted: boolean;
  totalAvailable: number | null;
  order: PrivateOrder;
  startedAt: number;
  updatedAt: number;
  phase: PrivatePhase;
  revision: number;
}
export interface PrivateSyncSnapshot {
  phase: PrivatePhase;
  target: PrivateTarget;
  namespace: string | null;
  identity: PrivateIdentity | null;
  listedCount: number;
  fetchedCount: number;
  messageCount: number;
  failedCount: number;
  pendingCount: number;
  totalAvailable: number | null;
  listExhausted: boolean;
  order: PrivateOrder;
  startedAt: number | null;
  updatedAt: number | null;
  retryAt: number | null;
  notice: string;
  diagnostics: PrivateDiagnostics;
  revision: number;
}

/** JSON framing avoids ambiguous concatenation between account and workspace IDs. */
export const privateNamespace = (identity: PrivateIdentity): string =>
  JSON.stringify(['chatgpt', identity.accountId, identity.workspaceId]);

export const emptyPrivateSnapshot = (): PrivateSyncSnapshot => ({
  phase: 'idle', target: 1000, namespace: null, identity: null,
  listedCount: 0, fetchedCount: 0, messageCount: 0, failedCount: 0, pendingCount: 0,
  totalAvailable: null, listExhausted: false, order: 'unknown',
  startedAt: null, updatedAt: null, retryAt: null, notice: '',
  diagnostics: { skippedMessages: 0, truncatedConversations: 0 }, revision: 0,
});
