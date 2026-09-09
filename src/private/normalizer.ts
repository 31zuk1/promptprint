import { PrivateTransportError, type PrivateConversationRecord, type PrivateListItem } from './models';

export interface NormalizationRequest {
  requestId: number;
  input: unknown;
  item: PrivateListItem;
  namespace: string;
  fetchedAt: number;
}
export type NormalizationResponse =
  | { requestId: number; record: PrivateConversationRecord }
  | { requestId: number; code: string };

/** A separate worker keeps a large provider graph off the UI thread. */
export class PrivateNormalizer {
  private worker: Worker | null = null;
  private sequence = 0;
  private pending = new Map<number, { resolve: (record: PrivateConversationRecord) => void; reject: (error: Error) => void }>();

  normalize = (input: unknown, item: PrivateListItem, namespace: string, fetchedAt: number): Promise<PrivateConversationRecord> => {
    if (!this.worker) {
      const worker = new Worker(new URL('./private-normalize.worker.ts', import.meta.url), { type: 'module' });
      this.worker = worker;
      worker.onmessage = (event: MessageEvent<NormalizationResponse>) => {
        if (this.worker !== worker) return;
        const response = event.data;
        const pending = this.pending.get(response.requestId);
        this.pending.delete(response.requestId);
        if ('record' in response) pending?.resolve(response.record);
        else pending?.reject(new PrivateTransportError(response.code));
      };
      worker.onerror = () => this.dispose();
    }
    const requestId = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      try {
        this.worker!.postMessage({ requestId, input, item, namespace, fetchedAt } satisfies NormalizationRequest);
      } catch {
        this.pending.delete(requestId);
        reject(new PrivateTransportError('NORMALIZATION_WORKER'));
      }
    });
  };

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    for (const request of this.pending.values()) request.reject(new DOMException('正規化を停止しました。', 'AbortError'));
    this.pending.clear();
  }
}
