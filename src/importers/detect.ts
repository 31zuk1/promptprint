import type { SerializableFile } from '../domain/models';

export type UnknownRecord = Record<string, unknown>;
export type ImportFileKind = 'json' | 'zip' | 'unsupported';
export type DetectedProvider = 'chatgpt' | 'claude' | 'unknown';

export interface ProviderDetection {
  provider: DetectedProvider;
  reason: string;
}

const JSON_MIME_TYPES = new Set([
  'application/json',
  'application/ld+json',
  'text/json',
]);

// Conversation exports only exist in the modern Unix epoch. Keeping a fixed,
// generous upper bound prevents malformed values from reaching Date formatting
// APIs while avoiding a clock-dependent parser result.
export const MIN_IMPORT_TIMESTAMP_MS = 0;
export const MAX_IMPORT_TIMESTAMP_MS = Date.UTC(3000, 0, 1);

export const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const stringValue = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;

export const safeFileName = (name: string): string => {
  const withoutControls = Array.from(name)
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join('')
    .trim();
  if (withoutControls.length === 0) return '名称不明のファイル';
  return withoutControls.length <= 180
    ? withoutControls
    : `${withoutControls.slice(0, 177)}…`;
};

export const timestampValue = (value: unknown): number | null => {
  let candidate: number;
  if (typeof value === 'number') {
    candidate = value;
  } else if (typeof value === 'string' && value.trim().length > 0) {
    const numeric = Number(value);
    candidate = Number.isFinite(numeric) ? numeric : Date.parse(value);
  } else {
    return null;
  }

  if (!Number.isFinite(candidate)) return null;
  // ChatGPT exports use Unix seconds, while Claude commonly uses ISO strings.
  const milliseconds = Math.abs(candidate) < 100_000_000_000 ? candidate * 1_000 : candidate;
  if (
    !Number.isFinite(milliseconds) ||
    milliseconds < MIN_IMPORT_TIMESTAMP_MS ||
    milliseconds > MAX_IMPORT_TIMESTAMP_MS ||
    !Number.isFinite(new Date(milliseconds).getTime())
  ) {
    return null;
  }
  return milliseconds;
};

const hasZipSignature = (bytes: ArrayBuffer): boolean => {
  if (bytes.byteLength < 4) return false;
  const prefix = new Uint8Array(bytes, 0, 4);
  return prefix[0] === 0x50 && prefix[1] === 0x4b && (
    (prefix[2] === 0x03 && prefix[3] === 0x04) ||
    (prefix[2] === 0x05 && prefix[3] === 0x06) ||
    (prefix[2] === 0x07 && prefix[3] === 0x08)
  );
};

const looksLikeJsonBytes = (bytes: ArrayBuffer): boolean => {
  const view = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 64));
  let index = 0;
  if (view.length >= 3 && view[0] === 0xef && view[1] === 0xbb && view[2] === 0xbf) {
    index = 3;
  }
  while (index < view.length) {
    const byte = view[index];
    if (byte === 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0d) {
      index += 1;
      continue;
    }
    return byte === 0x5b || byte === 0x7b;
  }
  return false;
};

export const detectFileKind = (file: SerializableFile): ImportFileKind => {
  if (hasZipSignature(file.bytes)) return 'zip';

  const lowerName = file.name.toLocaleLowerCase('en-US');
  const mime = file.type.split(';', 1)[0]?.trim().toLocaleLowerCase('en-US') ?? '';
  if (lowerName.endsWith('.zip') || mime === 'application/zip' || mime === 'application/x-zip-compressed') {
    return 'zip';
  }
  if (lowerName.endsWith('.json') || JSON_MIME_TYPES.has(mime) || looksLikeJsonBytes(file.bytes)) {
    return 'json';
  }
  return 'unsupported';
};

const arrayFromRoot = (value: unknown): unknown[] | null => {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return null;
  if (Array.isArray(value.conversations)) return value.conversations;
  if (Array.isArray(value.chats)) return value.chats;
  return null;
};

const authorRole = (message: UnknownRecord): string | null => {
  const author = isRecord(message.author) ? message.author : null;
  return stringValue(author?.role) ?? stringValue(message.role) ?? stringValue(message.sender);
};

const scoreConversation = (value: unknown): { chatgpt: number; claude: number } => {
  if (!isRecord(value)) return { chatgpt: 0, claude: 0 };
  let chatgpt = 0;
  let claude = 0;

  if (isRecord(value.mapping)) chatgpt += 8;
  if (typeof value.current_node === 'string' || typeof value.currentNode === 'string') chatgpt += 4;
  if (Array.isArray(value.chat_messages)) claude += 8;
  if ('uuid' in value) claude += 1;
  if ('created_at' in value || 'updated_at' in value) claude += 1;

  const messages = Array.isArray(value.chat_messages)
    ? value.chat_messages
    : Array.isArray(value.messages)
      ? value.messages
      : [];
  for (const candidate of messages.slice(0, 8)) {
    if (!isRecord(candidate)) continue;
    const role = authorRole(candidate)?.toLocaleLowerCase('en-US');
    if (isRecord(candidate.author) && stringValue(candidate.author.role)) chatgpt += 2;
    if ('sender' in candidate || role === 'human' || role === 'ai' || role === 'claude') claude += 3;
    if ('created_at' in candidate || 'uuid' in candidate) claude += 1;
  }

  if (Array.isArray(value.messages) && chatgpt === 0 && claude === 0) chatgpt += 1;
  return { chatgpt, claude };
};

const hasMinimalRoleContentMessages = (value: unknown): boolean => {
  if (!isRecord(value)) return false;
  const messages = Array.isArray(value.chat_messages)
    ? value.chat_messages
    : Array.isArray(value.messages)
      ? value.messages
      : [];
  return messages.slice(0, 8).some((candidate) => {
    if (!isRecord(candidate)) return false;
    const role = authorRole(candidate)?.trim().toLocaleLowerCase('en-US');
    const recognizedRole = role === 'human' || role === 'user' ||
      role === 'assistant' || role === 'ai' || role === 'claude';
    const content = isRecord(candidate.content) ? candidate.content : null;
    const hasContent = typeof candidate.text === 'string' ||
      typeof candidate.content === 'string' ||
      Array.isArray(candidate.content) ||
      (content !== null && (
        typeof content.text === 'string' ||
        typeof content.value === 'string' ||
        Array.isArray(content.parts) ||
        Array.isArray(content.blocks)
      ));
    return recognizedRole && hasContent;
  });
};

export const detectJsonProvider = (
  value: unknown,
  sourceFile = '',
): ProviderDetection => {
  const root = isRecord(value) && (isRecord(value.mapping) || Array.isArray(value.messages) || Array.isArray(value.chat_messages))
    ? [value]
    : arrayFromRoot(value);

  if (!root || root.length === 0) {
    return { provider: 'unknown', reason: '対応する会話配列を確認できませんでした。' };
  }

  let chatgpt = 0;
  let claude = 0;
  let minimalRoleContentConversations = 0;
  for (const conversation of root.slice(0, 12)) {
    const score = scoreConversation(conversation);
    chatgpt += score.chatgpt;
    claude += score.claude;
    if (hasMinimalRoleContentMessages(conversation)) minimalRoleContentConversations += 1;
  }

  const lowerSource = sourceFile.toLocaleLowerCase('en-US');
  const hasClaudeFileHint = lowerSource.includes('claude');
  const hasClaudeContainerHint = isRecord(value) && Array.isArray(value.chats);
  if (hasClaudeFileHint) claude += 3;
  if (minimalRoleContentConversations > 0 && (hasClaudeFileHint || hasClaudeContainerHint)) {
    claude += 4;
  }
  if (lowerSource.includes('chatgpt')) chatgpt += 3;
  if (/conversations\.json$/i.test(lowerSource) && claude === 0) chatgpt += 1;

  if (claude >= 4 && claude > chatgpt) {
    return { provider: 'claude', reason: 'Claude形式の会話・メッセージ構造を検出しました。' };
  }
  if (chatgpt > 0 && chatgpt >= claude) {
    return { provider: 'chatgpt', reason: 'ChatGPT形式の会話・メッセージ構造を検出しました。' };
  }
  return { provider: 'unknown', reason: 'プロバイダーを安全に判定できませんでした。' };
};

export const isLikelyConversationJson = (name: string): boolean => {
  const normalized = name.replace(/\\/g, '/');
  const baseName = normalized.split('/').at(-1)?.toLocaleLowerCase('en-US') ?? '';
  return baseName === 'conversations.json' ||
    baseName === 'chats.json' ||
    /(?:conversation|conversations|chat|chats)[-_\d]*\.json$/i.test(baseName) ||
    /^claude(?:[-_](?:conversation|conversations|chat|chats))?[-_\d]*\.json$/i.test(baseName) ||
    /^\d+\.json$/.test(baseName);
};
