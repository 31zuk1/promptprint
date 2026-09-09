/// <reference lib="webworker" />

import { analyzeConversations } from '../analysis/pipeline';
import { initializeMorphology } from '../analysis/morphology';
import { importSerializableFiles } from '../importers';
import type { WorkerRequest, WorkerResponse } from './protocol';

const worker = self as DedicatedWorkerGlobalScope;

const post = (message: WorkerResponse): void => worker.postMessage(message);

let newestRequest = -1;
worker.onmessage = (event: MessageEvent<WorkerRequest>) => {
  newestRequest = event.data.requestId;
  void handle(event.data);
};

const handle = async (request: WorkerRequest): Promise<void> => {
  try {
    post({ type: 'PROGRESS', requestId: request.requestId, stage: '端末内の品詞辞書を準備中' });
    await initializeMorphology();
    if (request.requestId !== newestRequest) return;
    if (request.type === 'IMPORT_AND_ANALYZE') {
      post({ type: 'PROGRESS', requestId: request.requestId, stage: 'ファイルを確認中' });
      await Promise.resolve();
      post({ type: 'PROGRESS', requestId: request.requestId, stage: '会話を読み込み中' });
      const imported = await importSerializableFiles(request.files);
      if (request.requestId !== newestRequest) return;
      if (imported.conversations.length === 0) {
        const reason = imported.diagnostics.errors[0]?.message ??
          '対応している会話データを見つけられませんでした。';
        post({ type: 'ERROR', requestId: request.requestId, message: reason, diagnostics: imported.diagnostics });
        return;
      }
      post({ type: 'PROGRESS', requestId: request.requestId, stage: 'テキストを正規化中' });
      await Promise.resolve();
      post({ type: 'PROGRESS', requestId: request.requestId, stage: '単語とフレーズを集計中' });
      const result = analyzeConversations(
        imported.conversations,
        request.settings,
        imported.diagnostics.recordsSkipped,
      );
      post({ type: 'PROGRESS', requestId: request.requestId, stage: 'レイアウトを生成中' });
      post({
        type: 'COMPLETE',
        requestId: request.requestId,
        conversations: imported.conversations,
        diagnostics: imported.diagnostics,
        result,
      });
      return;
    }

    post({ type: 'PROGRESS', requestId: request.requestId, stage: 'テキストを正規化中' });
    await Promise.resolve();
    post({ type: 'PROGRESS', requestId: request.requestId, stage: '単語とフレーズを集計中' });
    const result = analyzeConversations(
      request.conversations,
      request.settings,
      request.diagnostics.recordsSkipped,
    );
    post({ type: 'PROGRESS', requestId: request.requestId, stage: 'レイアウトを生成中' });
    post({
      type: 'COMPLETE',
      requestId: request.requestId,
      conversations: request.conversations,
      diagnostics: request.diagnostics,
      result,
    });
  } catch (error: unknown) {
    if (request.requestId !== newestRequest) return;
    const message = error instanceof Error && error.message.startsWith('形態素')
      ? '端末内の品詞辞書を読み込めませんでした。ページを再読み込みしてください。会話は送信されません。'
      : '解析できませんでした。ファイルや表示条件を確認して再試行してください。';
    post({ type: 'ERROR', requestId: request.requestId, message });
  }
};

export {};
