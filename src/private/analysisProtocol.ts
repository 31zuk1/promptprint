import type { AnalysisResult, AnalysisSettings } from '../domain/models';

export interface PrivateAnalysisRequest {
  type: 'ANALYZE_STORED';
  requestId: number;
  namespace: string;
  revision: number;
  settings: AnalysisSettings;
  skippedCount: number;
}

export type PrivateAnalysisResponse =
  | { type: 'PROGRESS'; requestId: number; stage: string }
  | {
      type: 'COMPLETE'; requestId: number; revision: number; result: AnalysisResult;
      loadedThreads: number; loadedMessages: number;
    }
  | { type: 'ERROR'; requestId: number; message: string };
