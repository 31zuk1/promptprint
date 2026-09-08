export const MAX_TOTAL_NORMALIZED_CONVERSATIONS = 20_000;
export const MAX_TOTAL_NORMALIZED_MESSAGES = 200_000;

export interface ImportBudgetLimits {
  maxConversations?: number;
  maxMessages?: number;
}

export interface ImportBudget {
  maxConversations: number;
  maxMessages: number;
  remainingConversations: number;
  remainingMessages: number;
  droppedConversations: number;
  droppedMessages: number;
  skippedSources: number;
}

const boundedLimit = (value: number | undefined, maximum: number): number => {
  if (value === undefined) return maximum;
  if (!Number.isFinite(value)) return maximum;
  return Math.min(maximum, Math.max(0, Math.floor(value)));
};

export const createImportBudget = (limits: ImportBudgetLimits = {}): ImportBudget => {
  const maxConversations = boundedLimit(
    limits.maxConversations,
    MAX_TOTAL_NORMALIZED_CONVERSATIONS,
  );
  const maxMessages = boundedLimit(limits.maxMessages, MAX_TOTAL_NORMALIZED_MESSAGES);
  return {
    maxConversations,
    maxMessages,
    remainingConversations: maxConversations,
    remainingMessages: maxMessages,
    droppedConversations: 0,
    droppedMessages: 0,
    skippedSources: 0,
  };
};

export const isImportBudgetExhausted = (budget: ImportBudget): boolean =>
  budget.remainingConversations <= 0 || budget.remainingMessages <= 0;

export const importBudgetDroppedAnything = (budget: ImportBudget): boolean =>
  budget.droppedConversations > 0 || budget.droppedMessages > 0 || budget.skippedSources > 0;

export const importBudgetDiagnosticMessage = (budget: ImportBudget): string =>
  `保持上限（会話最大${budget.maxConversations.toLocaleString('ja-JP')}件・メッセージ最大` +
  `${budget.maxMessages.toLocaleString('ja-JP')}件）のいずれかに達したため、会話候補` +
  `${budget.droppedConversations.toLocaleString('ja-JP')}件、メッセージ候補` +
  `${budget.droppedMessages.toLocaleString('ja-JP')}件、後続ファイル／ZIP項目` +
  `${budget.skippedSources.toLocaleString('ja-JP')}件を読み飛ばしました。`;
