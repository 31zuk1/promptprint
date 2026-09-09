/// <reference lib="webworker" />
import { analyzeConversations } from '../analysis/pipeline';
import { initializeMorphology } from '../analysis/morphology';
import type { NormalizedConversation } from '../domain/models';
import { IndexedDbPrivateStore } from './store';
import type { PrivateAnalysisRequest, PrivateAnalysisResponse } from './analysisProtocol';

const worker = self as DedicatedWorkerGlobalScope;
const store = new IndexedDbPrivateStore();
let cachedNamespace: string | null = null;
let cachedRevision = -1;
let conversations: NormalizedConversation[] = [];
const post = (response: PrivateAnalysisResponse) => worker.postMessage(response);
let newestRequest = -1;

worker.onmessage = (event: MessageEvent<PrivateAnalysisRequest>) => {
  void (async () => {
    const request = event.data;
    if (request.type !== 'ANALYZE_STORED') return;
    newestRequest = request.requestId;
    try {
      post({ type: 'PROGRESS', requestId: request.requestId, stage: '端末内の品詞辞書を準備中' });
      await initializeMorphology();
      if (request.requestId !== newestRequest) return;
      post({ type: 'PROGRESS', requestId: request.requestId, stage: '保存済みの本文を読み込み中' });
      // The corpus stays in this worker. Filter changes reuse it, and only
      // throttled acquisition checkpoints cause another IndexedDB read.
      if (cachedNamespace !== request.namespace || cachedRevision !== request.revision) {
        const loaded = await store.listConversations(request.namespace);
        if (request.requestId !== newestRequest) return;
        conversations = loaded;
        cachedNamespace = request.namespace;
        cachedRevision = request.revision;
      }
      post({ type: 'PROGRESS', requestId: request.requestId, stage: '単語とフレーズを端末内で集計中' });
      const result = analyzeConversations(conversations, request.settings, request.skippedCount);
      post({
        type: 'COMPLETE', requestId: request.requestId, revision: request.revision, result,
        loadedThreads: conversations.length,
        loadedMessages: conversations.reduce((sum, conversation) => sum + conversation.messages.length, 0),
      });
    } catch (error: unknown) {
      if (request.requestId !== newestRequest) return;
      // Provider payloads and private strings are never copied into errors.
      const message = error instanceof Error && error.message.startsWith('形態素')
        ? '端末内の品詞辞書を読み込めませんでした。個人用ページを再読み込みしてください。保存済み会話は消去されず、追加取得も行いません。'
        : '保存済みデータの解析に失敗しました。取得を停止して再解析するか、表示条件を軽くして再試行してください。';
      post({ type: 'ERROR', requestId: request.requestId, message });
    }
  })();
};

export {};
