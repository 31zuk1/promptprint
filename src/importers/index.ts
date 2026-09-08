import { diagnostic, emptyImportDiagnostics, safeShapeDescription } from '../domain/diagnostics';
import type {
  ImportDiagnostics,
  ImportResult,
  NormalizedConversation,
  SerializableFile,
} from '../domain/models';
import { parseChatGptExport } from './chatgpt';
import { parseClaudeExport } from './claude';
import {
  detectFileKind,
  detectJsonProvider,
  safeFileName,
} from './detect';
import { stableIdentityHash } from './identity';
import {
  createImportBudget,
  importBudgetDiagnosticMessage,
  importBudgetDroppedAnything,
  isImportBudgetExhausted,
} from './limits';
import type { ImportBudget, ImportBudgetLimits } from './limits';
import { extractJsonEntriesFromZip, MAX_ARCHIVE_BYTES } from './zip';
import type { ZipJsonEntry } from './zip';

export { parseChatGptExport } from './chatgpt';
export { parseClaudeExport } from './claude';
export { detectFileKind, detectJsonProvider } from './detect';
export { extractJsonEntriesFromZip } from './zip';
export {
  MAX_TOTAL_NORMALIZED_CONVERSATIONS,
  MAX_TOTAL_NORMALIZED_MESSAGES,
} from './limits';

export const MAX_INPUT_FILES = 32;
export const MAX_TOTAL_INPUT_BYTES = 500 * 1024 * 1024;
export const MAX_JSON_BYTES = 200 * 1024 * 1024;

const addFileSeen = (diagnostics: ImportDiagnostics, fileName: string): void => {
  if (!diagnostics.filesSeen.includes(fileName)) diagnostics.filesSeen.push(fileName);
};

const mergeDiagnostics = (
  target: ImportDiagnostics,
  source: ImportDiagnostics,
): void => {
  for (const fileName of source.filesSeen) addFileSeen(target, fileName);
  target.conversationsParsed += source.conversationsParsed;
  target.messagesParsed += source.messagesParsed;
  target.recordsSkipped += source.recordsSkipped;
  target.warnings.push(...source.warnings);
  target.errors.push(...source.errors);
};

const mergeResult = (
  conversations: NormalizedConversation[],
  diagnostics: ImportDiagnostics,
  result: ImportResult,
): void => {
  conversations.push(...result.conversations);
  mergeDiagnostics(diagnostics, result.diagnostics);
};

const parseJsonBytes = (
  bytes: Uint8Array,
  sourceFile: string,
  sourceIdentity: string,
  conversations: NormalizedConversation[],
  diagnostics: ImportDiagnostics,
  budget: ImportBudget,
): void => {
  addFileSeen(diagnostics, sourceFile);
  if (bytes.byteLength === 0) {
    diagnostics.recordsSkipped += 1;
    diagnostics.errors.push(diagnostic(
      'JSON_EMPTY',
      'error',
      'JSONファイルが空です。会話エクスポートを選び直してください。',
      sourceFile,
    ));
    return;
  }
  if (bytes.byteLength > MAX_JSON_BYTES) {
    diagnostics.recordsSkipped += 1;
    diagnostics.errors.push(diagnostic(
      'JSON_TOO_LARGE',
      'error',
      'JSONファイルが200 MBの安全上限を超えています。エクスポートを分割して再試行してください。',
      sourceFile,
    ));
    return;
  }

  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    diagnostics.recordsSkipped += 1;
    diagnostics.errors.push(diagnostic(
      'JSON_ENCODING_UNSUPPORTED',
      'error',
      'JSONをUTF-8として読み取れませんでした。UTF-8形式へ変換して再試行してください。',
      sourceFile,
    ));
    return;
  }

  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^\uFEFF/, '')) as unknown;
  } catch {
    diagnostics.recordsSkipped += 1;
    diagnostics.errors.push(diagnostic(
      'JSON_PARSE_FAILED',
      'error',
      'JSONが壊れているか、正しいJSON形式ではありません。元のエクスポートを確認してください。',
      sourceFile,
    ));
    return;
  }

  const detected = detectJsonProvider(value, sourceFile);
  if (detected.provider === 'chatgpt') {
    mergeResult(
      conversations,
      diagnostics,
      parseChatGptExport(value, sourceFile, budget, sourceIdentity),
    );
    return;
  }
  if (detected.provider === 'claude') {
    mergeResult(
      conversations,
      diagnostics,
      parseClaudeExport(value, sourceFile, budget, sourceIdentity),
    );
    return;
  }

  diagnostics.recordsSkipped += 1;
  diagnostics.errors.push(diagnostic(
    'JSON_UNSUPPORTED_SHAPE',
    'error',
    '対応するChatGPTまたはClaudeの会話形式を確認できませんでした。エクスポート内の会話JSONを選んでください。',
    sourceFile,
    `${detected.reason} ${safeShapeDescription(value)}`,
  ));
};

interface ZipEntrySelection {
  selected: ZipJsonEntry[];
  skipped: ZipJsonEntry[];
}

const selectZipEntries = (entries: ZipJsonEntry[]): ZipEntrySelection => {
  const likely = entries.filter((entry) => entry.likelyConversationJson);
  if (likely.length === 0) return { selected: entries, skipped: [] };

  // Aggregate exports sometimes ship beside numbered or provider-specific
  // conversation files. Parse every likely candidate instead of assuming that
  // conversations.json is the only source and silently losing the others.
  return {
    selected: likely,
    skipped: entries.filter((entry) => !entry.likelyConversationJson),
  };
};

const importZip = (
  file: SerializableFile,
  sourceFile: string,
  conversations: NormalizedConversation[],
  diagnostics: ImportDiagnostics,
  budget: ImportBudget,
  fileIdentity: string,
): void => {
  const extracted = extractJsonEntriesFromZip(file.bytes, sourceFile);
  diagnostics.warnings.push(...extracted.warnings);
  diagnostics.errors.push(...extracted.errors);
  if (extracted.entries.length === 0) {
    diagnostics.recordsSkipped += extracted.errors.length > 0 ? 1 : 0;
    return;
  }

  const selection = selectZipEntries(extracted.entries);
  if (selection.skipped.length > 0) {
    diagnostics.recordsSkipped += selection.skipped.length;
    const names = selection.skipped
      .slice(0, 8)
      .map((entry) => safeFileName(entry.name))
      .join('、');
    diagnostics.warnings.push(diagnostic(
      'ZIP_UNLIKELY_JSON_SKIPPED',
      'warning',
      `会話ファイル名に一致しないJSONを${selection.skipped.length.toLocaleString('ja-JP')}件読み飛ばしました。`,
      sourceFile,
      names.length > 0 ? `対象: ${names}${selection.skipped.length > 8 ? ' ほか' : ''}` : undefined,
    ));
  }
  for (let entryIndex = 0; entryIndex < selection.selected.length; entryIndex += 1) {
    if (isImportBudgetExhausted(budget)) {
      const skippedSources = selection.selected.length - entryIndex;
      diagnostics.recordsSkipped += skippedSources;
      budget.skippedSources += skippedSources;
      break;
    }
    const entry = selection.selected[entryIndex];
    if (!entry) continue;
    const entrySource = safeFileName(`${sourceFile} / ${entry.name}`);
    const entryIdentity = stableIdentityHash([
      'zip-source',
      fileIdentity,
      entry.sourceIdentityHash,
      entryIndex,
    ]);
    parseJsonBytes(entry.bytes, entrySource, entryIdentity, conversations, diagnostics, budget);
  }
};

const measuredFileSize = (file: SerializableFile): number => {
  const declared = Number.isFinite(file.size) && file.size >= 0 ? file.size : 0;
  return Math.max(declared, file.bytes.byteLength);
};

export const importSerializableFiles = async (
  files: SerializableFile[],
  limits: ImportBudgetLimits = {},
): Promise<ImportResult> => {
  const safeNames = files.slice(0, MAX_INPUT_FILES).map((file) => safeFileName(file.name));
  const diagnostics = emptyImportDiagnostics(safeNames);
  const conversations: NormalizedConversation[] = [];
  const budget = createImportBudget(limits);

  if (files.length === 0) {
    diagnostics.errors.push(diagnostic(
      'NO_INPUT_FILES',
      'error',
      '読み込むファイルがありません。ChatGPTまたはClaudeのJSON／ZIPを選んでください。',
    ));
    return { conversations, diagnostics };
  }
  if (files.length > MAX_INPUT_FILES) {
    diagnostics.recordsSkipped = files.length;
    diagnostics.errors.push(diagnostic(
      'TOO_MANY_INPUT_FILES',
      'error',
      `一度に読み込めるファイルは${MAX_INPUT_FILES.toLocaleString('ja-JP')}件までです。ファイルを分けて再試行してください。`,
    ));
    return { conversations, diagnostics };
  }

  const totalBytes = files.reduce((sum, file) => sum + measuredFileSize(file), 0);
  if (!Number.isFinite(totalBytes) || totalBytes > MAX_TOTAL_INPUT_BYTES) {
    diagnostics.recordsSkipped = files.length;
    diagnostics.errors.push(diagnostic(
      'TOTAL_INPUT_TOO_LARGE',
      'error',
      '選択したファイルの合計が500 MBの安全上限を超えています。分けて読み込んでください。',
    ));
    return { conversations, diagnostics };
  }

  for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
    if (isImportBudgetExhausted(budget)) {
      const skippedSources = files.length - fileIndex;
      diagnostics.recordsSkipped += skippedSources;
      budget.skippedSources += skippedSources;
      break;
    }
    const file = files[fileIndex];
    if (!file) continue;
    const sourceFile = safeFileName(file.name);
    const fileIdentity = stableIdentityHash(['input-file', fileIndex, file.name]);
    const size = measuredFileSize(file);
    const kind = detectFileKind(file);
    if (kind === 'unsupported') {
      diagnostics.recordsSkipped += 1;
      diagnostics.errors.push(diagnostic(
        'UNSUPPORTED_FILE_TYPE',
        'error',
        'このファイル形式には対応していません。JSONまたはZIPを選んでください。',
        sourceFile,
      ));
      continue;
    }
    if (kind === 'zip') {
      if (size > MAX_ARCHIVE_BYTES) {
        diagnostics.recordsSkipped += 1;
        diagnostics.errors.push(diagnostic(
          'ZIP_INPUT_TOO_LARGE',
          'error',
          'ZIPファイルが500 MBの安全上限を超えています。エクスポートを分割してください。',
          sourceFile,
        ));
        continue;
      }
      importZip(file, sourceFile, conversations, diagnostics, budget, fileIdentity);
      continue;
    }
    parseJsonBytes(
      new Uint8Array(file.bytes),
      sourceFile,
      fileIdentity,
      conversations,
      diagnostics,
      budget,
    );
  }

  // Parser diagnostics are merged incrementally; set these from the final data so
  // mixed JSON/ZIP imports cannot drift from the actual returned collection.
  diagnostics.conversationsParsed = conversations.length;
  diagnostics.messagesParsed = conversations.reduce((sum, conversation) => sum + conversation.messages.length, 0);
  if (importBudgetDroppedAnything(budget)) {
    diagnostics.warnings.push(diagnostic(
      'IMPORT_AGGREGATE_LIMIT',
      'warning',
      importBudgetDiagnosticMessage(budget),
    ));
  }
  if (conversations.length === 0 && diagnostics.errors.length === 0) {
    diagnostics.errors.push(diagnostic(
      'NO_SUPPORTED_CONVERSATIONS',
      'error',
      '対応する会話を読み込めませんでした。エクスポート形式とファイル内容を確認してください。',
    ));
  }
  return { conversations, diagnostics };
};
