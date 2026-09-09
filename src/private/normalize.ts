import { parseChatGptExport } from '../importers/chatgpt';
import { isRecord } from '../importers/detect';
import type { UnknownRecord } from '../importers/detect';
import { PrivateTransportError } from './models';
import type { PrivateConversationRecord, PrivateListItem } from './models';

const MAX_NODES = 200_000;
const isVisibleMessage = (value: unknown): value is UnknownRecord => {
  if (!isRecord(value)) return false;
  const metadata = isRecord(value.metadata) ? value.metadata : {};
  const channel = value.channel ?? metadata.channel;
  // Do not treat reasoning, analysis, notification or unknown internal channels as chat text.
  if (channel !== undefined && channel !== null && channel !== 'final' && channel !== 'commentary') return false;
  if (metadata.is_visually_hidden_from_conversation === true || metadata.is_hidden === true) return false;
  const author = isRecord(value.author) ? value.author : {};
  const role = author.role ?? value.role;
  return role === 'user' || role === 'assistant';
};

/** Reuse the export adapter, but remove non-visible channels before branch selection. */
export const normalizePrivateDetail = (
  input: unknown,
  item: PrivateListItem,
  namespace: string,
  fetchedAt: number,
): PrivateConversationRecord => {
  if (!isRecord(input)) throw new PrivateTransportError('DETAIL_SHAPE');
  if (input.has_more === true || input.next_cursor || input.nextCursor) {
    throw new PrivateTransportError('DETAIL_PAGINATION_UNSUPPORTED');
  }
  const detailId = input.id ?? input.conversation_id;
  if (detailId !== undefined && detailId !== item.id) throw new PrivateTransportError('DETAIL_ID_MISMATCH');
  let filtered = 0;
  const visible = (message: unknown): unknown => {
    if (!isVisibleMessage(message)) { if (message) filtered += 1; return null; }
    return message;
  };
  const sanitized: UnknownRecord = {
    id: item.id,
    title: input.title,
    create_time: input.create_time,
    update_time: input.update_time,
    created_at: input.created_at,
    updated_at: input.updated_at,
    current_node: input.current_node ?? input.currentNode,
  };
  if (isRecord(input.mapping)) {
    const entries = Object.entries(input.mapping);
    if (entries.length > MAX_NODES) throw new PrivateTransportError('DETAIL_NODE_LIMIT');
    // Preserve graph edges, including hidden nodes, so the selected branch stays intact.
    sanitized.mapping = Object.fromEntries(entries.map(([id, node]) => [id, isRecord(node)
      ? { parent: node.parent, children: node.children, message: visible(node.message) }
      : null]));
  } else if (Array.isArray(input.messages)) {
    if (input.messages.length > MAX_NODES) throw new PrivateTransportError('DETAIL_NODE_LIMIT');
    sanitized.messages = input.messages.map(visible);
  } else throw new PrivateTransportError('DETAIL_SHAPE');

  const parsed = parseChatGptExport(sanitized, undefined, undefined, namespace);
  const conversation = parsed.conversations[0];
  if (!conversation || conversation.messages.length === 0) throw new PrivateTransportError('DETAIL_NO_VISIBLE_TEXT');
  // Only normalized visible text is returned to persistence; the provider graph is discarded.
  return {
    ...item, fetchedAt, conversation,
    diagnostics: {
      skippedMessages: filtered + parsed.diagnostics.recordsSkipped,
      truncatedConversations: parsed.diagnostics.warnings.some(({ code }) =>
        /(?:LIMIT|TRUNCATED|FALLBACK)/.test(code)) ? 1 : 0,
    },
  };
};
