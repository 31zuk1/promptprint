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
export type TimeRange = 'all' | '30d' | '90d' | '1y' | 'custom';
export type VocabularyFocus = 'topics' | 'all';

export interface AnalysisSettings {
  provider: ProviderFilter;
  timeRange: TimeRange;
  startDate: string;
  endDate: string;
  termLimit: 40 | 60 | 80 | 120;
  includePhrases: boolean;
  vocabularyFocus: VocabularyFocus;
  excludeCode: boolean;
  excludeQuotes: boolean;
  minDocumentFrequency: number;
  hiddenTerms: string[];
}

export const DEFAULT_ANALYSIS_SETTINGS: AnalysisSettings = {
  provider: 'all',
  timeRange: 'all',
  startDate: '',
  endDate: '',
  termLimit: 80,
  includePhrases: true,
  vocabularyFocus: 'topics',
  excludeCode: true,
  excludeQuotes: true,
  minDocumentFrequency: 2,
  hiddenTerms: [],
};

export type TermKind = 'word' | 'phrase';
export type BiasLabel = 'user' | 'shared' | 'assistant' | 'insufficient';

export interface TermStats {
  term: string;
  display: string;
  kind: TermKind;
  dfUser: number;
  dfAssistant: number;
  rateUser: number;
  rateAssistant: number;
  userMessageCount: number;
  assistantMessageCount: number;
  tokenFrequencyUser: number;
  tokenFrequencyAssistant: number;
  tokenTotalUser: number;
  tokenTotalAssistant: number;
  per1000TokensUser: number | null;
  per1000TokensAssistant: number | null;
  bias: number;
  biasLabel: BiasLabel;
  importance: number;
  conversationCoverage: number;
  providerCoverage: Provider[];
  rawFrequency: number;
  /** Selection evidence only; never a size/coordinate or a semantic score. */
  topicEvidence?: { eligible: boolean; nounMessageCount: number; score: number };
  lexicalEligible?: boolean;
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
  timeline?: TimelineMetadata;
  display: {
    layoutOmittedCount: number;
    compoundSuppressedCount: number;
    /** Committed display policy; absent only in legacy aggregate fixtures. */
    vocabularyFocus?: VocabularyFocus;
    topicFilteredCount?: number;
  };
  terms: TermStats[];
  layout: LaidOutTerm[];
  contexts: Record<string, TermContext[]>;
  insights: Insights;
  diagnostics: DiagnosticItem[];
}

/** Provider-filtered date coverage before applying the selected time range. */
export interface TimelineMetadata {
  startDate: string | null;
  endDate: string | null;
  datedMessageCount: number;
  undatedMessageCount: number;
  fallbackMessageCount: number;
  appliedRange?: { startDate: string; endDate: string };
  sourceProviders?: Provider[];
}

export interface SerializableFile {
  name: string;
  type: string;
  size: number;
  bytes: ArrayBuffer;
}
