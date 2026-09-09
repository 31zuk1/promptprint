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

const MAX_GRAPH_NODES = 200_000;
const MAX_MESSAGES_PER_CONVERSATION = 100_000;
const MAX_BRANCH_CANDIDATES = 5_000;
export const MAX_FALLBACK_TRAVERSAL_STEPS = 1_000_000;
const MAX_TEXT_BLOCKS = 256;
const MAX_TEXT_CHARS = 1_000_000;
const MAX_CONTENT_DEPTH = 6;
export const MAX_CONTENT_ITEMS = 4_096;

const EXCLUDED_CONTENT_TYPES = new Set([
  'analysis',
  'audio_transcription',
  'computer_initialize_state',
  'computer_output',
  'execution_output',
  'image_asset_pointer',
  'model_editable_context',
  'reasoning',
  'reasoning_recap',
  'system_error',
  'tether_browsing_display',
  'thoughts',
  'tool_result',
  'user_editable_context',
]);

// Thinking-model exports can carry internal text with an ordinary assistant
// role and content_type="text". Legacy messages have no channel; visible
// final/commentary text remains eligible under the existing role rules.
const EXCLUDED_CHANNELS = new Set(['analysis', 'reasoning', 'thoughts']);

interface ExtractedText {
  text: string;
  truncated: boolean;
}

interface ParsedMessage {
  rawId: string | null;
  role: MessageRole;
  createdAt: number | null;
  text: string;
  truncated: boolean;
}

interface GraphPath {
  nodeIds: string[];
  leafId: string;
}

interface TraversalBudget {
  remaining: number;
}

interface TextCollectionState {
  chars: number;
  visited: number;
  truncated: boolean;
}

const normalizeRole = (value: unknown): MessageRole | null => {
  if (typeof value !== 'string') return null;
  const role = value.trim().toLocaleLowerCase('en-US');
  return role === 'user' || role === 'assistant' ? role : null;
};

const contentType = (value: unknown): string | null => {
  if (!isRecord(value)) return null;
  return stringValue(value.content_type)?.toLocaleLowerCase('en-US') ??
    stringValue(value.type)?.toLocaleLowerCase('en-US') ??
    null;
};

const shouldSkipMessage = (message: UnknownRecord): boolean => {
  const recipient = stringValue(message.recipient)?.toLocaleLowerCase('en-US');
  if (recipient && recipient !== 'all' && recipient !== 'none') return true;

  const metadata = isRecord(message.metadata) ? message.metadata : null;
  const channel = stringValue(message.channel)?.trim().toLocaleLowerCase('en-US');
  const metadataChannel = stringValue(metadata?.channel)?.trim().toLocaleLowerCase('en-US');
  if ((channel && EXCLUDED_CHANNELS.has(channel)) ||
    (metadataChannel && EXCLUDED_CHANNELS.has(metadataChannel))) return true;
  if (metadata?.is_visually_hidden_from_conversation === true) return true;
  if (metadata && (
    typeof metadata.tool_name === 'string' ||
    typeof metadata.command === 'string' ||
    typeof metadata.invoked_plugin === 'string'
  )) return true;

  const type = contentType(message.content) ?? contentType(message);
  return type !== null && EXCLUDED_CONTENT_TYPES.has(type);
};

const collectText = (
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
      collectText(item, blocks, state, depth + 1);
      if (state.truncated) break;
    }
    return;
  }
  if (!isRecord(value)) return;

  const type = contentType(value);
  if (type && EXCLUDED_CONTENT_TYPES.has(type)) return;
  if (type && /(?:image|audio|video|file|asset|tool|execution|computer)/i.test(type) && type !== 'text') {
    return;
  }

  if (typeof value.text === 'string') {
    collectText(value.text, blocks, state, depth + 1);
    return;
  }
  if (Array.isArray(value.parts)) {
    collectText(value.parts, blocks, state, depth + 1);
    return;
  }
  if (typeof value.content === 'string' || Array.isArray(value.content) || isRecord(value.content)) {
    collectText(value.content, blocks, state, depth + 1);
  }
};

const extractText = (message: UnknownRecord): ExtractedText => {
  const blocks: string[] = [];
  const state: TextCollectionState = { chars: 0, visited: 0, truncated: false };
  if ('content' in message) collectText(message.content, blocks, state, 0);
  if (blocks.length === 0 && typeof message.text === 'string') {
    collectText(message.text, blocks, state, 0);
  }
  return { text: blocks.join('\n\n').trim(), truncated: state.truncated };
};

export const extractChatGptText = (message: unknown): string =>
  isRecord(message) ? extractText(message).text : '';

const parseMessage = (value: unknown): ParsedMessage | null => {
  if (!isRecord(value) || shouldSkipMessage(value)) return null;
  const author = isRecord(value.author) ? value.author : null;
  const role = normalizeRole(author?.role) ?? normalizeRole(value.role);
  if (!role) return null;
  const extracted = extractText(value);
  if (extracted.text.length === 0) return null;
  return {
    rawId: stringValue(value.id) ?? stringValue(value.uuid),
    role,
    createdAt: timestampValue(value.create_time ?? value.created_at ?? value.createdAt),
    text: extracted.text,
    truncated: extracted.truncated,
  };
};

const conversationCandidates = (input: unknown): unknown[] | null => {
  if (Array.isArray(input)) return input;
  if (!isRecord(input)) return null;
  if (Array.isArray(input.conversations)) return input.conversations;
  if (isRecord(input.mapping) || Array.isArray(input.messages)) return [input];
  return null;
};

const stablePart = (value: string): string => {
  const compact = value.slice(0, 256).replace(/[^\p{L}\p{N}._:-]+/gu, '-').replace(/^-+|-+$/g, '');
  return compact.slice(0, 120) || 'unknown';
};

const conversationId = (
  conversation: UnknownRecord,
  sourceFile: string | undefined,
  sourceIdentity: string,
  index: number,
): string => {
  const source = stablePart(sourceFile ?? 'memory');
  const rawId = stringValue(conversation.id) ?? stringValue(conversation.conversation_id) ?? stringValue(conversation.uuid);
  const readableId = stablePart(rawId ?? String(index + 1));
  const hash = stableIdentityHash([
    'chatgpt-conversation',
    sourceIdentity,
    rawId ?? '',
    index,
  ]);
  return `chatgpt:${source}:${readableId}~${hash}`;
};

const normalizeMessage = (
  parsed: ParsedMessage,
  normalizedConversationId: string,
  order: number,
  fallbackId: string,
): NormalizedMessage => ({
  id: `${normalizedConversationId}:message:${stablePart(parsed.rawId ?? fallbackId)}~${stableIdentityHash([
    'chatgpt-message',
    normalizedConversationId,
    parsed.rawId ?? '',
    fallbackId,
    order,
  ])}`,
  conversationId: normalizedConversationId,
  provider: 'chatgpt',
  role: parsed.role,
  createdAt: parsed.createdAt,
  order,
  originalText: parsed.text,
  analysisText: parsed.text,
});

const rawNodeId = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

const tracePath = (
  mapping: UnknownRecord,
  leafId: string,
  maxNodes: number,
  budget?: TraversalBudget,
): GraphPath | null => {
  const reversed: string[] = [];
  const visited = new Set<string>();
  let nodeId: string | null = leafId;

  while (nodeId !== null && reversed.length < maxNodes) {
    if (budget) {
      if (budget.remaining <= 0) return null;
      budget.remaining -= 1;
    }
    if (visited.has(nodeId)) return null;
    visited.add(nodeId);
    const node = mapping[nodeId];
    if (!isRecord(node)) return null;
    reversed.push(nodeId);
    const parent = node.parent;
    if (parent === null || parent === undefined || parent === '') {
      return { nodeIds: reversed.reverse(), leafId };
    }
    nodeId = rawNodeId(parent);
    if (nodeId === null || !(nodeId in mapping)) return null;
  }
  return null;
};

const messageFromNode = (mapping: UnknownRecord, nodeId: string): ParsedMessage | null => {
  const node = mapping[nodeId];
  return isRecord(node) ? parseMessage(node.message) : null;
};

const pathScore = (
  mapping: UnknownRecord,
  path: GraphPath,
  budget?: TraversalBudget,
): { latest: number | null; usable: number; length: number; leafId: string } | null => {
  let latest: number | null = null;
  let usable = 0;
  for (const nodeId of path.nodeIds) {
    if (budget) {
      if (budget.remaining <= 0) return null;
      budget.remaining -= 1;
    }
    const message = messageFromNode(mapping, nodeId);
    if (!message) continue;
    usable += 1;
    if (message.createdAt !== null) latest = message.createdAt;
  }
  return { latest, usable, length: path.nodeIds.length, leafId: path.leafId };
};

const isBetterPath = (
  candidate: NonNullable<ReturnType<typeof pathScore>>,
  current: NonNullable<ReturnType<typeof pathScore>> | null,
): boolean => {
  if (!current) return true;
  if (candidate.latest !== null || current.latest !== null) {
    if (candidate.latest === null) return false;
    if (current.latest === null) return true;
    if (candidate.latest !== current.latest) return candidate.latest > current.latest;
  }
  if (candidate.usable !== current.usable) return candidate.usable > current.usable;
  if (candidate.length !== current.length) return candidate.length > current.length;
  return candidate.leafId.localeCompare(current.leafId, 'en') < 0;
};

const selectFallbackPath = (
  mapping: UnknownRecord,
  nodeIds: string[],
): { path: GraphPath | null; budgetExceeded: boolean; candidatesSkipped: number } => {
  const referencedParents = new Set<string>();
  for (const nodeId of nodeIds) {
    const node = mapping[nodeId];
    if (!isRecord(node)) continue;
    const parent = rawNodeId(node.parent);
    if (parent && parent in mapping) referencedParents.add(parent);
  }
  const leaves = nodeIds.filter((nodeId) => !referencedParents.has(nodeId));
  const allCandidates = leaves.length > 0 ? leaves : nodeIds;
  const candidates = allCandidates.slice(0, MAX_BRANCH_CANDIDATES);
  const candidatesSkipped = allCandidates.length - candidates.length;

  const budget: TraversalBudget = { remaining: MAX_FALLBACK_TRAVERSAL_STEPS };
  let best: GraphPath | null = null;
  let bestScore: NonNullable<ReturnType<typeof pathScore>> | null = null;
  for (const leafId of candidates) {
    const path = tracePath(mapping, leafId, nodeIds.length + 1, budget);
    if (!path) {
      if (budget.remaining <= 0) break;
      continue;
    }
    const score = pathScore(mapping, path, budget);
    if (!score) break;
    if (isBetterPath(score, bestScore)) {
      best = path;
      bestScore = score;
    }
  }
  return { path: best, budgetExceeded: budget.remaining <= 0, candidatesSkipped };
};

interface ConversationParseOutcome {
  conversation: NormalizedConversation | null;
  skipped: number;
  branchFallback: boolean;
  truncatedMessages: number;
  graphTooLarge: boolean;
  fallbackBudgetExceeded: boolean;
  fallbackCandidatesSkipped: number;
  messagesDroppedByBudget: number;
}

const baseConversation = (
  value: UnknownRecord,
  id: string,
  messages: NormalizedMessage[],
  sourceFile?: string,
): NormalizedConversation => ({
  id,
  provider: 'chatgpt',
  title: stringValue(value.title) ?? stringValue(value.name) ?? '無題の会話',
  createdAt: timestampValue(value.create_time ?? value.created_at ?? value.createdAt),
  updatedAt: timestampValue(value.update_time ?? value.updated_at ?? value.updatedAt),
  messages,
  ...(sourceFile ? { sourceFile } : {}),
});

const parseGraphConversation = (
  value: UnknownRecord,
  id: string,
  normalizedMessageLimit: number,
  sourceFile?: string,
): ConversationParseOutcome => {
  const mapping = isRecord(value.mapping) ? value.mapping : {};
  const allNodeIds = Object.keys(mapping);
  if (allNodeIds.length > MAX_GRAPH_NODES) {
    return {
      conversation: null,
      skipped: 1,
      branchFallback: false,
      truncatedMessages: 0,
      graphTooLarge: true,
      fallbackBudgetExceeded: false,
      fallbackCandidatesSkipped: 0,
      messagesDroppedByBudget: 0,
    };
  }

  const currentNode = rawNodeId(value.current_node ?? value.currentNode);
  let path = currentNode && currentNode in mapping
    ? tracePath(mapping, currentNode, allNodeIds.length + 1)
    : null;
  let branchFallback = false;
  let fallbackBudgetExceeded = false;
  let fallbackCandidatesSkipped = 0;
  if (!path) {
    branchFallback = true;
    const selected = selectFallbackPath(mapping, allNodeIds);
    path = selected.path;
    fallbackBudgetExceeded = selected.budgetExceeded;
    fallbackCandidatesSkipped = selected.candidatesSkipped;
  }
  if (!path) {
    return {
      conversation: null,
      skipped: 1,
      branchFallback,
      truncatedMessages: 0,
      graphTooLarge: false,
      fallbackBudgetExceeded,
      fallbackCandidatesSkipped,
      messagesDroppedByBudget: 0,
    };
  }

  const messages: NormalizedMessage[] = [];
  // Only consider the selected path. A discarded branch can reuse a message
  // ID and must never reserve that ID ahead of the selected visible answer.
  const seenMessageIds = new Set<string>();
  let skipped = 0;
  let truncatedMessages = 0;
  let messagesDroppedByBudget = 0;
  let stoppedByBudget = false;
  const candidateNodeIds = path.nodeIds.slice(0, MAX_MESSAGES_PER_CONVERSATION);
  for (let nodeIndex = 0; nodeIndex < candidateNodeIds.length; nodeIndex += 1) {
    if (messages.length >= normalizedMessageLimit) {
      messagesDroppedByBudget = path.nodeIds.length - nodeIndex;
      skipped += messagesDroppedByBudget;
      stoppedByBudget = true;
      break;
    }
    const nodeId = candidateNodeIds[nodeIndex];
    if (!nodeId) continue;
    const node = mapping[nodeId];
    if (!isRecord(node) || node.message === null || node.message === undefined) continue;
    const parsed = parseMessage(node.message);
    if (!parsed) {
      skipped += 1;
      continue;
    }
    if (parsed.rawId && seenMessageIds.has(parsed.rawId)) {
      skipped += 1;
      continue;
    }
    if (parsed.rawId) seenMessageIds.add(parsed.rawId);
    if (parsed.truncated) truncatedMessages += 1;
    messages.push(normalizeMessage(parsed, id, messages.length, nodeId));
  }
  if (!stoppedByBudget && path.nodeIds.length > MAX_MESSAGES_PER_CONVERSATION) {
    skipped += path.nodeIds.length - MAX_MESSAGES_PER_CONVERSATION;
  }

  return {
    conversation: messages.length > 0 ? baseConversation(value, id, messages, sourceFile) : null,
    skipped: messages.length > 0 ? skipped : Math.max(1, skipped),
    branchFallback,
    truncatedMessages,
    graphTooLarge: false,
    fallbackBudgetExceeded,
    fallbackCandidatesSkipped,
    messagesDroppedByBudget,
  };
};

const parseDirectConversation = (
  value: UnknownRecord,
  id: string,
  normalizedMessageLimit: number,
  sourceFile?: string,
): ConversationParseOutcome => {
  const rawMessages = Array.isArray(value.messages) ? value.messages : [];
  const messages: NormalizedMessage[] = [];
  const seenMessageIds = new Set<string>();
  let skipped = 0;
  let truncatedMessages = 0;
  let messagesDroppedByBudget = 0;
  let stoppedByBudget = false;
  const candidates = rawMessages.slice(0, MAX_MESSAGES_PER_CONVERSATION);
  for (let index = 0; index < candidates.length; index += 1) {
    if (messages.length >= normalizedMessageLimit) {
      messagesDroppedByBudget = rawMessages.length - index;
      skipped += messagesDroppedByBudget;
      stoppedByBudget = true;
      break;
    }
    const parsed = parseMessage(candidates[index]);
    if (!parsed) {
      skipped += 1;
      continue;
    }
    if (parsed.rawId && seenMessageIds.has(parsed.rawId)) {
      skipped += 1;
      continue;
    }
    if (parsed.rawId) seenMessageIds.add(parsed.rawId);
    if (parsed.truncated) truncatedMessages += 1;
    messages.push(normalizeMessage(parsed, id, messages.length, String(index + 1)));
  }
  if (!stoppedByBudget && rawMessages.length > candidates.length) {
    skipped += rawMessages.length - candidates.length;
  }
  return {
    conversation: messages.length > 0 ? baseConversation(value, id, messages, sourceFile) : null,
    skipped: messages.length > 0 ? skipped : Math.max(1, skipped),
    branchFallback: false,
    truncatedMessages,
    graphTooLarge: false,
    fallbackBudgetExceeded: false,
    fallbackCandidatesSkipped: 0,
    messagesDroppedByBudget,
  };
};

export const parseChatGptExport = (
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
      'CHATGPT_UNSUPPORTED_SHAPE',
      'error',
      'ChatGPTの会話形式を確認できませんでした。エクスポート内の conversations.json を選んでください。',
      safeSource,
      safeShapeDescription(input),
    ));
    return { conversations: [], diagnostics };
  }
  if (candidates.length === 0) {
    diagnostics.errors.push(diagnostic(
      'CHATGPT_EMPTY',
      'error',
      'ChatGPTの会話が空です。別のエクスポートファイルを確認してください。',
      safeSource,
    ));
    return { conversations: [], diagnostics };
  }

  const conversations: NormalizedConversation[] = [];
  let fallbackCount = 0;
  let truncatedMessages = 0;
  let oversizedGraphs = 0;
  let fallbackBudgetExceeded = 0;
  let fallbackCandidatesSkipped = 0;
  const limitedCandidates = candidates.slice(0, MAX_TOTAL_NORMALIZED_CONVERSATIONS);
  diagnostics.recordsSkipped += candidates.length - limitedCandidates.length;
  budget.droppedConversations += candidates.length - limitedCandidates.length;

  for (let index = 0; index < limitedCandidates.length; index += 1) {
    if (isImportBudgetExhausted(budget)) {
      const dropped = limitedCandidates.length - index;
      diagnostics.recordsSkipped += dropped;
      budget.droppedConversations += dropped;
      break;
    }
    const value = limitedCandidates[index];
    if (!isRecord(value)) {
      diagnostics.recordsSkipped += 1;
      continue;
    }
    const id = conversationId(value, safeSource, internalSourceIdentity, index);
    const outcome = isRecord(value.mapping)
      ? parseGraphConversation(value, id, budget.remainingMessages, safeSource)
      : parseDirectConversation(value, id, budget.remainingMessages, safeSource);
    diagnostics.recordsSkipped += outcome.skipped;
    budget.droppedMessages += outcome.messagesDroppedByBudget;
    if (outcome.branchFallback) fallbackCount += 1;
    if (outcome.graphTooLarge) oversizedGraphs += 1;
    if (outcome.fallbackBudgetExceeded) fallbackBudgetExceeded += 1;
    fallbackCandidatesSkipped += outcome.fallbackCandidatesSkipped;
    truncatedMessages += outcome.truncatedMessages;
    if (outcome.conversation) {
      conversations.push(outcome.conversation);
      budget.remainingConversations -= 1;
      budget.remainingMessages -= outcome.conversation.messages.length;
    }
  }

  diagnostics.conversationsParsed = conversations.length;
  diagnostics.messagesParsed = conversations.reduce((sum, conversation) => sum + conversation.messages.length, 0);

  if (fallbackCount > 0) {
    diagnostics.warnings.push(diagnostic(
      'CHATGPT_BRANCH_FALLBACK',
      'warning',
      `${fallbackCount.toLocaleString('ja-JP')}件の会話で現在の分岐が不明だったため、安全上限内で最新の利用可能な分岐を選びました。`,
      safeSource,
    ));
  }
  if (truncatedMessages > 0) {
    diagnostics.warnings.push(diagnostic(
      'CHATGPT_TEXT_TRUNCATED',
      'warning',
      `${truncatedMessages.toLocaleString('ja-JP')}件の非常に長いメッセージを安全上の上限で短縮しました。`,
      safeSource,
    ));
  }
  if (oversizedGraphs > 0) {
    diagnostics.warnings.push(diagnostic(
      'CHATGPT_RECORD_LIMIT',
      'warning',
      '安全上の件数上限を超えたレコードを読み飛ばしました。より小さいエクスポートで再試行してください。',
      safeSource,
    ));
  }
  if (fallbackBudgetExceeded > 0) {
    diagnostics.warnings.push(diagnostic(
      'CHATGPT_FALLBACK_WORK_LIMIT',
      'warning',
      `${fallbackBudgetExceeded.toLocaleString('ja-JP')}件の複雑な分岐で安全上の探索上限に達したため、上限内の候補から分岐を選びました。`,
      safeSource,
    ));
  }
  if (fallbackCandidatesSkipped > 0) {
    diagnostics.warnings.push(diagnostic(
      'CHATGPT_FALLBACK_CANDIDATE_LIMIT',
      'warning',
      `分岐終端候補が安全上限を超えたため、${fallbackCandidatesSkipped.toLocaleString('ja-JP')}件を探索対象外とし、先頭${MAX_BRANCH_CANDIDATES.toLocaleString('ja-JP')}件の候補内から分岐を選びました。`,
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
      'CHATGPT_RECORDS_SKIPPED',
      'warning',
      `${diagnostics.recordsSkipped.toLocaleString('ja-JP')}件の未対応・空・重複・非表示・システム／ツール系・上限超過レコードを読み飛ばしました。`,
      safeSource,
    ));
  }
  if (conversations.length === 0) {
    diagnostics.errors.push(diagnostic(
      'CHATGPT_NO_USABLE_MESSAGES',
      'error',
      'ユーザーとAIのテキストメッセージを見つけられませんでした。エクスポート形式を確認してください。',
      safeSource,
    ));
  }

  return { conversations, diagnostics };
};
