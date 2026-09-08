import { diagnostic, emptyImportDiagnostics, safeShapeDescription } from '../domain/diagnostics';
import type {
  ImportResult,
  MessageRole,
  NormalizedConversation,
  NormalizedMessage,
} from '../domain/models';
import { isRecord, safeFileName, stringValue, timestampValue } from './detect';
import type { UnknownRecord } from './detect';
import { stableIdentityHash } from './identity';
import {
  createImportBudget,
  importBudgetDiagnosticMessage,
  importBudgetDroppedAnything,
  isImportBudgetExhausted,
  MAX_TOTAL_NORMALIZED_CONVERSATIONS,
} from './limits';
import type { ImportBudget } from './limits';

const MAX_MESSAGES_PER_CONVERSATION = 100_000;
const MAX_CONTENT_DEPTH = 6;
const MAX_TEXT_BLOCKS = 256;
const MAX_TEXT_CHARS = 1_000_000;
export const MAX_CONTENT_ITEMS = 4_096;

const NON_TEXT_TYPES = /(?:image|audio|video|file|attachment|asset|tool|execution|computer)/i;
const CONTROL_MESSAGE_TYPES = new Set([
  'context',
  'developer',
  'model_editable_context',
  'system',
  'user_editable_context',
]);

interface ExtractedText {
  text: string;
  truncated: boolean;
}

interface TextCollectionState {
  chars: number;
  visited: number;
  truncated: boolean;
}

const normalizeRole = (value: unknown): MessageRole | null => {
  if (typeof value !== 'string') return null;
  switch (value.trim().toLocaleLowerCase('en-US')) {
    case 'human':
    case 'user':
      return 'user';
    case 'assistant':
    case 'ai':
    case 'claude':
      return 'assistant';
    default:
      return null;
  }
};

const lowerType = (value: unknown): string | null => {
  if (!isRecord(value)) return null;
  return stringValue(value.type)?.trim().toLocaleLowerCase('en-US') ??
    stringValue(value.content_type)?.trim().toLocaleLowerCase('en-US') ??
    null;
};

const shouldSkipMessage = (message: UnknownRecord): boolean => {
  const recipient = stringValue(message.recipient)?.trim().toLocaleLowerCase('en-US');
  if (recipient && recipient !== 'all' && recipient !== 'none') return true;

  const metadata = isRecord(message.metadata) ? message.metadata : null;
  if (metadata?.is_visually_hidden_from_conversation === true) return true;
  if (metadata && (
    typeof metadata.tool_name === 'string' ||
    typeof metadata.command === 'string' ||
    typeof metadata.invoked_plugin === 'string'
  )) return true;

  const type = lowerType(message) ?? lowerType(message.content);
  if (!type) return false;
  return CONTROL_MESSAGE_TYPES.has(type) || NON_TEXT_TYPES.test(type);
};

const collectClaudeText = (
  value: unknown,
  blocks: string[],
  state: TextCollectionState,
  depth: number,
): void => {
  if (state.truncated) return;
  if (state.visited >= MAX_CONTENT_ITEMS) {
    state.truncated = true;
    return;
  }
  state.visited += 1;
  if (depth > MAX_CONTENT_DEPTH || blocks.length >= MAX_TEXT_BLOCKS) {
    state.truncated = true;
    return;
  }
  if (typeof value === 'string') {
    if (value.trim().length === 0) return;
    const remaining = MAX_TEXT_CHARS - state.chars;
    if (remaining <= 0) {
      state.truncated = true;
      return;
    }
    const text = value.length > remaining ? value.slice(0, remaining) : value;
    blocks.push(text);
    state.chars += text.length;
    if (text.length < value.length) state.truncated = true;
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectClaudeText(item, blocks, state, depth + 1);
      if (state.truncated) break;
    }
    return;
  }
  if (!isRecord(value)) return;

  const type = stringValue(value.type)?.toLocaleLowerCase('en-US') ?? null;
  if (type && type !== 'text' && type !== 'input_text' && type !== 'output_text' && NON_TEXT_TYPES.test(type)) {
    return;
  }
  if (typeof value.text === 'string') {
    collectClaudeText(value.text, blocks, state, depth + 1);
    return;
  }
  if (typeof value.value === 'string' && (!type || type === 'text')) {
    collectClaudeText(value.value, blocks, state, depth + 1);
    return;
  }
  if (typeof value.content === 'string' || Array.isArray(value.content) || isRecord(value.content)) {
    collectClaudeText(value.content, blocks, state, depth + 1);
    return;
  }
  if (Array.isArray(value.blocks)) {
    collectClaudeText(value.blocks, blocks, state, depth + 1);
  }
};

const extractText = (message: UnknownRecord): ExtractedText => {
  const blocks: string[] = [];
  const state: TextCollectionState = { chars: 0, visited: 0, truncated: false };
  if (typeof message.text === 'string') {
    collectClaudeText(message.text, blocks, state, 0);
  }
  if (blocks.length === 0 && 'content' in message) {
    collectClaudeText(message.content, blocks, state, 0);
  }
  if (blocks.length === 0 && 'blocks' in message) {
    collectClaudeText(message.blocks, blocks, state, 0);
  }
  return { text: blocks.join('\n\n').trim(), truncated: state.truncated };
};

export const extractClaudeText = (message: unknown): string =>
  isRecord(message) ? extractText(message).text : '';

const roleFromMessage = (message: UnknownRecord): MessageRole | null => {
  const author = isRecord(message.author) ? message.author : null;
  return normalizeRole(message.sender) ?? normalizeRole(message.role) ?? normalizeRole(author?.role);
};

const stablePart = (value: string): string => {
  const compact = value.slice(0, 256).replace(/[^\p{L}\p{N}._:-]+/gu, '-').replace(/^-+|-+$/g, '');
  return compact.slice(0, 120) || 'unknown';
};

const conversationCandidates = (input: unknown): unknown[] | null => {
  if (Array.isArray(input)) return input;
  if (!isRecord(input)) return null;
  if (Array.isArray(input.conversations)) return input.conversations;
  if (Array.isArray(input.chats)) return input.chats;
  if (Array.isArray(input.chat_messages) || Array.isArray(input.messages)) return [input];
  return null;
};

const messageCandidates = (conversation: UnknownRecord): unknown[] | null => {
  if (Array.isArray(conversation.chat_messages)) return conversation.chat_messages;
  if (Array.isArray(conversation.messages)) return conversation.messages;
  return null;
};

const normalizedConversationId = (
  conversation: UnknownRecord,
  sourceFile: string | undefined,
  sourceIdentity: string,
  index: number,
): string => {
  const rawId = stringValue(conversation.uuid) ??
    stringValue(conversation.id) ??
    stringValue(conversation.conversation_id) ??
    String(index + 1);
  const hash = stableIdentityHash([
    'claude-conversation',
    sourceIdentity,
    rawId,
    index,
  ]);
  return `claude:${stablePart(sourceFile ?? 'memory')}:${stablePart(rawId)}~${hash}`;
};

const normalizeMessage = (
  message: UnknownRecord,
  conversationId: string,
  order: number,
  fallbackId: string,
): { message: NormalizedMessage | null; truncated: boolean } => {
  if (shouldSkipMessage(message)) return { message: null, truncated: false };
  const role = roleFromMessage(message);
  if (!role) return { message: null, truncated: false };
  const extracted = extractText(message);
  if (extracted.text.length === 0) return { message: null, truncated: extracted.truncated };
  const rawId = stringValue(message.uuid) ?? stringValue(message.id) ?? fallbackId;
  return {
    message: {
      id: `${conversationId}:message:${stablePart(rawId)}~${stableIdentityHash([
        'claude-message',
        conversationId,
        rawId,
        fallbackId,
        order,
      ])}`,
      conversationId,
      provider: 'claude',
      role,
      createdAt: timestampValue(message.created_at ?? message.createdAt ?? message.create_time),
      order,
      originalText: extracted.text,
      analysisText: extracted.text,
    },
    truncated: extracted.truncated,
  };
};

export const parseClaudeExport = (
  input: unknown,
  sourceFile?: string,
  sharedBudget?: ImportBudget,
  sourceIdentity?: string,
): ImportResult => {
  const safeSource = sourceFile ? safeFileName(sourceFile) : undefined;
  const diagnostics = emptyImportDiagnostics(safeSource ? [safeSource] : []);
  const ownsBudget = sharedBudget === undefined;
  const budget = sharedBudget ?? createImportBudget();
  const internalSourceIdentity = sourceIdentity ?? sourceFile ?? 'memory';
  const candidates = conversationCandidates(input);
  if (!candidates) {
    diagnostics.errors.push(diagnostic(
      'CLAUDE_UNSUPPORTED_SHAPE',
      'error',
      'Claudeの対応済み会話形式を確認できませんでした。匿名化したスキーマ例があれば形式対応に役立ちます。',
      safeSource,
      safeShapeDescription(input),
    ));
    return { conversations: [], diagnostics };
  }
  if (candidates.length === 0) {
    diagnostics.errors.push(diagnostic(
      'CLAUDE_EMPTY',
      'error',
      'Claudeの会話配列が空です。別のエクスポートファイルを確認してください。',
      safeSource,
    ));
    return { conversations: [], diagnostics };
  }

  const conversations: NormalizedConversation[] = [];
  let truncatedMessages = 0;
  const limitedCandidates = candidates.slice(0, MAX_TOTAL_NORMALIZED_CONVERSATIONS);
  diagnostics.recordsSkipped += candidates.length - limitedCandidates.length;
  budget.droppedConversations += candidates.length - limitedCandidates.length;

  for (let conversationIndex = 0; conversationIndex < limitedCandidates.length; conversationIndex += 1) {
    if (isImportBudgetExhausted(budget)) {
      const dropped = limitedCandidates.length - conversationIndex;
      diagnostics.recordsSkipped += dropped;
      budget.droppedConversations += dropped;
      break;
    }
    const rawConversation = limitedCandidates[conversationIndex];
    if (!isRecord(rawConversation)) {
      diagnostics.recordsSkipped += 1;
      continue;
    }
    const rawMessages = messageCandidates(rawConversation);
    if (!rawMessages) {
      diagnostics.recordsSkipped += 1;
      continue;
    }
    const id = normalizedConversationId(
      rawConversation,
      safeSource,
      internalSourceIdentity,
      conversationIndex,
    );
    const messages: NormalizedMessage[] = [];
    const limitedMessages = rawMessages.slice(0, MAX_MESSAGES_PER_CONVERSATION);
    let stoppedByBudget = false;
    for (let messageIndex = 0; messageIndex < limitedMessages.length; messageIndex += 1) {
      if (messages.length >= budget.remainingMessages) {
        const dropped = rawMessages.length - messageIndex;
        diagnostics.recordsSkipped += dropped;
        budget.droppedMessages += dropped;
        stoppedByBudget = true;
        break;
      }
      const rawMessage = limitedMessages[messageIndex];
      if (!isRecord(rawMessage)) {
        diagnostics.recordsSkipped += 1;
        continue;
      }
      const normalized = normalizeMessage(rawMessage, id, messages.length, String(messageIndex + 1));
      if (!normalized.message) {
        diagnostics.recordsSkipped += 1;
        continue;
      }
      if (normalized.truncated) truncatedMessages += 1;
      messages.push(normalized.message);
    }
    if (!stoppedByBudget && rawMessages.length > limitedMessages.length) {
      diagnostics.recordsSkipped += rawMessages.length - limitedMessages.length;
    }
    if (messages.length === 0) {
      diagnostics.recordsSkipped += 1;
      continue;
    }

    const explicitCreatedAt = timestampValue(
      rawConversation.created_at ?? rawConversation.createdAt ?? rawConversation.create_time,
    );
    const explicitUpdatedAt = timestampValue(
      rawConversation.updated_at ?? rawConversation.updatedAt ?? rawConversation.update_time,
    );
    const conversation: NormalizedConversation = {
      id,
      provider: 'claude',
      title: stringValue(rawConversation.name) ?? stringValue(rawConversation.title) ?? '無題の会話',
      createdAt: explicitCreatedAt ?? messages[0]?.createdAt ?? null,
      updatedAt: explicitUpdatedAt ?? messages.at(-1)?.createdAt ?? null,
      messages,
      ...(safeSource ? { sourceFile: safeSource } : {}),
    };
    conversations.push(conversation);
    budget.remainingConversations -= 1;
    budget.remainingMessages -= messages.length;
  }

  diagnostics.conversationsParsed = conversations.length;
  diagnostics.messagesParsed = conversations.reduce((sum, conversation) => sum + conversation.messages.length, 0);
  diagnostics.warnings.push(diagnostic(
    'CLAUDE_EXPERIMENTAL',
    'warning',
    'Claude取り込みは実験的です。エクスポート形式の変更により一部を読み飛ばす場合があります。',
    safeSource,
  ));
  if (truncatedMessages > 0) {
    diagnostics.warnings.push(diagnostic(
      'CLAUDE_TEXT_TRUNCATED',
      'warning',
      `${truncatedMessages.toLocaleString('ja-JP')}件の非常に長いメッセージを安全上の上限で短縮しました。`,
      safeSource,
    ));
  }
  if (ownsBudget && importBudgetDroppedAnything(budget)) {
    diagnostics.warnings.push(diagnostic(
      'IMPORT_AGGREGATE_LIMIT',
      'warning',
      importBudgetDiagnosticMessage(budget),
      safeSource,
    ));
  }
  if (diagnostics.recordsSkipped > 0) {
    diagnostics.warnings.push(diagnostic(
      'CLAUDE_RECORDS_SKIPPED',
      'warning',
      `${diagnostics.recordsSkipped.toLocaleString('ja-JP')}件の未対応・空・システム／ツール系・上限超過レコードを読み飛ばしました。`,
      safeSource,
    ));
  }
  if (conversations.length === 0) {
    diagnostics.errors.push(diagnostic(
      'CLAUDE_NO_USABLE_MESSAGES',
      'error',
      'Claude形式らしいデータは見つかりましたが、対応するユーザー／AIテキストを読み取れませんでした。',
      safeSource,
      safeShapeDescription(input),
    ));
  }

  return { conversations, diagnostics };
};
