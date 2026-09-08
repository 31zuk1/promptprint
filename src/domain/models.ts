export type Provider = 'chatgpt' | 'claude' | 'demo';
export type MessageRole = 'user' | 'assistant';

export interface NormalizedConversation {
  id: string;
  provider: Provider;
  title: string;
  createdAt: number | null;
  updatedAt: number | null;
  messages: NormalizedMessage[];
  sourceFile?: string;
}

export interface NormalizedMessage {
  id: string;
  conversationId: string;
  provider: Provider;
  role: MessageRole;
  createdAt: number | null;
  order: number;
  originalText: string;
  analysisText: string;
}

export type DiagnosticLevel = 'info' | 'warning' | 'error';

export interface DiagnosticItem {
  code: string;
  level: DiagnosticLevel;
  message: string;
  sourceFile?: string;
  detail?: string;
}

export interface ImportDiagnostics {
  filesSeen: string[];
  conversationsParsed: number;
  messagesParsed: number;
  recordsSkipped: number;
  warnings: DiagnosticItem[];
  errors: DiagnosticItem[];
}

export interface ImportResult {
  conversations: NormalizedConversation[];
  diagnostics: ImportDiagnostics;
}

export type ProviderFilter = 'all' | Provider;
export type TimeRange = 'all' | '30d' | '90d' | '1y';

export interface AnalysisSettings {
  provider: ProviderFilter;
  timeRange: TimeRange;
  termLimit: 40 | 60 | 80 | 120;
  includePhrases: boolean;
  excludeCode: boolean;
  excludeQuotes: boolean;
  minDocumentFrequency: number;
  hiddenTerms: string[];
}

export const DEFAULT_ANALYSIS_SETTINGS: AnalysisSettings = {
  provider: 'all',
  timeRange: 'all',
  termLimit: 80,
  includePhrases: true,
  excludeCode: true,
  excludeQuotes: true,
  minDocumentFrequency: 2,
  hiddenTerms: [],
};

export type TermKind = 'word' | 'phrase';
export type BiasLabel = 'user' | 'shared' | 'assistant';

export interface TermStats {
  term: string;
  display: string;
  kind: TermKind;
  dfUser: number;
  dfAssistant: number;
  rateUser: number;
  rateAssistant: number;
  bias: number;
  biasLabel: BiasLabel;
  importance: number;
  conversationCoverage: number;
  providerCoverage: Provider[];
  rawFrequency: number;
}

export interface TermContext {
  id: string;
  term: string;
  conversationId: string;
  conversationTitle: string;
  provider: Provider;
  role: MessageRole;
  createdAt: number | null;
  excerpt: string;
  matchStart: number;
  matchEnd: number;
}

export interface LaidOutTerm extends TermStats {
  x: number;
  y: number;
  fontSize: number;
  width: number;
  height: number;
  color: string;
}

export interface EchoInsight {
  rate: number | null;
  eligiblePairs: number;
  confidence: 'insufficient' | 'low' | 'medium' | 'high';
}

export interface AdoptionCandidate {
  term: string;
  display: string;
  assistantFirstAt: number | null;
  userFirstAt: number | null;
  laterUserMessages: number;
  laterConversations: number;
}

export interface ProviderComparison {
  provider: Exclude<Provider, 'demo'>;
  topTerms: string[];
  messageCount: number;
}

export interface Insights {
  userIntroduced: TermStats[];
  assistantReturned: TermStats[];
  shared: TermStats[];
  echo: EchoInsight;
  adoption: AdoptionCandidate[];
  providerComparison: ProviderComparison[] | null;
}

export interface DatasetSummary {
  conversationCount: number;
  userMessageCount: number;
  assistantMessageCount: number;
  providers: Provider[];
  dateStart: number | null;
  dateEnd: number | null;
  analyzedTermCount: number;
  skippedCount: number;
}

export interface AnalysisResult {
  summary: DatasetSummary;
  terms: TermStats[];
  layout: LaidOutTerm[];
  contexts: Record<string, TermContext[]>;
  insights: Insights;
  diagnostics: DiagnosticItem[];
}

export interface SerializableFile {
  name: string;
  type: string;
  size: number;
  bytes: ArrayBuffer;
}
