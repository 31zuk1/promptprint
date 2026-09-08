import type {
  AnalysisResult,
  AnalysisSettings,
  ImportDiagnostics,
  NormalizedConversation,
  SerializableFile,
} from '../domain/models';

export const ANALYSIS_STAGES = [
  'ファイルを確認中',
  '会話を読み込み中',
  'テキストを正規化中',
  '単語とフレーズを集計中',
  'レイアウトを生成中',
] as const;

export type AnalysisStage = (typeof ANALYSIS_STAGES)[number];

export type WorkerRequest =
  | {
      type: 'IMPORT_AND_ANALYZE';
      requestId: number;
      files: SerializableFile[];
      settings: AnalysisSettings;
    }
  | {
      type: 'ANALYZE_NORMALIZED';
      requestId: number;
      conversations: NormalizedConversation[];
      settings: AnalysisSettings;
      diagnostics: ImportDiagnostics;
    };

export type WorkerResponse =
  | { type: 'PROGRESS'; requestId: number; stage: AnalysisStage }
  | {
      type: 'COMPLETE';
      requestId: number;
      conversations: NormalizedConversation[];
      diagnostics: ImportDiagnostics;
      result: AnalysisResult;
    }
  | { type: 'ERROR'; requestId: number; message: string; diagnostics?: ImportDiagnostics };
