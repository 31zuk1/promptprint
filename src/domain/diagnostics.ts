import type { DiagnosticItem, ImportDiagnostics } from './models';

export const emptyImportDiagnostics = (filesSeen: string[] = []): ImportDiagnostics => ({
  filesSeen,
  conversationsParsed: 0,
  messagesParsed: 0,
  recordsSkipped: 0,
  warnings: [],
  errors: [],
});

export const diagnostic = (
  code: string,
  level: DiagnosticItem['level'],
  message: string,
  sourceFile?: string,
  detail?: string,
): DiagnosticItem => ({
  code,
  level,
  message,
  ...(sourceFile ? { sourceFile } : {}),
  ...(detail ? { detail } : {}),
});

// Only structural field names already understood as export-schema metadata are
// safe to echo. Arbitrary JSON object keys can themselves contain pasted/private
// text, so unknown names are counted rather than rendered.
const SAFE_SCHEMA_KEYS = new Set([
  'account',
  'author',
  'chat_messages',
  'chats',
  'content',
  'conversation_id',
  'conversations',
  'create_time',
  'created_at',
  'current_node',
  'id',
  'mapping',
  'message',
  'messages',
  'name',
  'role',
  'sender',
  'title',
  'type',
  'update_time',
  'updated_at',
  'uuid',
  'version',
]);

const MAX_SHAPE_KEYS_SCANNED = 64;
const MAX_SHAPE_KEYS_DISPLAYED = 12;

export const safeShapeDescription = (value: unknown): string => {
  if (Array.isArray(value)) return `配列（${value.length.toLocaleString('ja-JP')}件）`;
  if (value === null) return 'null';
  if (typeof value !== 'object') return typeof value;
  const safeKeys: string[] = [];
  let scanned = 0;
  let unknown = 0;
  let scanCapped = false;
  for (const key in value as Record<string, unknown>) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    if (scanned >= MAX_SHAPE_KEYS_SCANNED) {
      scanCapped = true;
      break;
    }
    scanned += 1;
    if (SAFE_SCHEMA_KEYS.has(key) && safeKeys.length < MAX_SHAPE_KEYS_DISPLAYED) safeKeys.push(key);
    else unknown += 1;
  }
  if (scanned === 0) return '空のオブジェクト';
  const parts: string[] = [];
  if (safeKeys.length > 0) parts.push(`キー: ${safeKeys.join(', ')}`);
  if (unknown > 0 || scanCapped) {
    parts.push(`未認識キー: ${unknown.toLocaleString('ja-JP')}${scanCapped ? '件以上' : '件'}`);
  }
  return `オブジェクト（${parts.join(' ／ ')}）`;
};
