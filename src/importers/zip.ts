import { unzipSync } from 'fflate';

import { diagnostic } from '../domain/diagnostics';
import type { DiagnosticItem } from '../domain/models';
import { isLikelyConversationJson, safeFileName } from './detect';
import { stableIdentityHash } from './identity';

export const MAX_ARCHIVE_BYTES = 500 * 1024 * 1024;
export const LARGE_ARCHIVE_WARNING_BYTES = 200 * 1024 * 1024;
export const MAX_ZIP_ENTRIES = 4_096;
export const MAX_ZIP_JSON_ENTRIES = 256;
export const MAX_ZIP_JSON_ENTRY_BYTES = 64 * 1024 * 1024;
export const MAX_ZIP_JSON_TOTAL_BYTES = 200 * 1024 * 1024;

export interface ZipJsonEntry {
  name: string;
  bytes: Uint8Array;
  /** Internal classification bit derived before the display path is truncated. */
  likelyConversationJson: boolean;
  /** Opaque identity derived from the full archive path; never shown to users. */
  sourceIdentityHash: string;
}

export interface ZipExtractionResult {
  entries: ZipJsonEntry[];
  warnings: DiagnosticItem[];
  errors: DiagnosticItem[];
}

const isDirectory = (name: string): boolean => /[\\/]$/.test(name);

const isHiddenMetadata = (name: string): boolean => {
  const segments = name.replace(/\\/g, '/').split('/').filter(Boolean);
  return segments.some((segment) => segment === '__MACOSX' || segment.startsWith('.'));
};

const boundedEntryBaseName = (name: string): string => {
  const normalized = name.replace(/\\/g, '/');
  const separator = normalized.lastIndexOf('/');
  // ZIP filenames are format-bounded, but keep classifier work independently
  // small and retain the suffix where extensions and numbered names live.
  return normalized.slice(separator + 1).slice(-256);
};

export const extractJsonEntriesFromZip = (
  input: ArrayBuffer | Uint8Array,
  archiveName: string,
): ZipExtractionResult => {
  const sourceFile = safeFileName(archiveName);
  const warnings: DiagnosticItem[] = [];
  const errors: DiagnosticItem[] = [];
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);

  if (bytes.byteLength > MAX_ARCHIVE_BYTES) {
    errors.push(diagnostic(
      'ZIP_INPUT_TOO_LARGE',
      'error',
      'ZIPファイルが500 MBの安全上限を超えています。エクスポートを分割して再試行してください。',
      sourceFile,
    ));
    return { entries: [], warnings, errors };
  }
  if (bytes.byteLength > LARGE_ARCHIVE_WARNING_BYTES) {
    warnings.push(diagnostic(
      'ZIP_INPUT_LARGE',
      'warning',
      '大きなZIPファイルです。端末によっては読み込みに時間がかかります。',
      sourceFile,
    ));
  }

  let totalEntries = 0;
  let fileEntries = 0;
  let jsonEntries = 0;
  let acceptedBytes = 0;
  let limitExceeded = false;
  let entryLimitExceeded = false;
  let extracted: Record<string, Uint8Array>;
  try {
    extracted = unzipSync(bytes, {
      filter: (entry) => {
        totalEntries += 1;
        if (totalEntries > MAX_ZIP_ENTRIES) {
          entryLimitExceeded = true;
          // Stop walking the central directory as soon as the cap is crossed;
          // returning false alone would still inspect every remaining entry.
          throw new Error('PROMPTPRINT_ZIP_ENTRY_LIMIT');
        }
        if (isDirectory(entry.name)) return false;
        fileEntries += 1;
        if (isHiddenMetadata(entry.name) || !entry.name.toLocaleLowerCase('en-US').endsWith('.json')) {
          return false;
        }

        jsonEntries += 1;
        const validSize = Number.isFinite(entry.originalSize) && entry.originalSize >= 0;
        const nextSize = validSize ? acceptedBytes + entry.originalSize : Number.POSITIVE_INFINITY;
        if (
          jsonEntries > MAX_ZIP_JSON_ENTRIES ||
          !validSize ||
          entry.originalSize > MAX_ZIP_JSON_ENTRY_BYTES ||
          nextSize > MAX_ZIP_JSON_TOTAL_BYTES
        ) {
          limitExceeded = true;
          return false;
        }
        acceptedBytes = nextSize;
        return true;
      },
    });
  } catch {
    if (entryLimitExceeded) {
      errors.push(diagnostic(
        'ZIP_ENTRY_LIMIT_EXCEEDED',
        'error',
        'ZIP内の項目数が安全上限（4,096件）を超えています。エクスポートを分割してください。',
        sourceFile,
      ));
      return { entries: [], warnings, errors };
    }
    errors.push(diagnostic(
      'ZIP_READ_FAILED',
      'error',
      'ZIPファイルを開けませんでした。破損していないChatGPTまたはClaudeのエクスポートか確認してください。',
      sourceFile,
    ));
    return { entries: [], warnings, errors };
  }

  if (fileEntries === 0) {
    errors.push(diagnostic(
      'ZIP_EMPTY',
      'error',
      'ZIPファイルが空です。会話JSONを含むエクスポートを選んでください。',
      sourceFile,
    ));
    return { entries: [], warnings, errors };
  }
  if (limitExceeded) {
    errors.push(diagnostic(
      'ZIP_CONTENT_LIMIT_EXCEEDED',
      'error',
      'ZIP内のJSONが安全上限（256件、1件64 MB、合計200 MB）を超えています。エクスポートを分割してください。',
      sourceFile,
    ));
    return { entries: [], warnings, errors };
  }
  if (jsonEntries === 0) {
    errors.push(diagnostic(
      'ZIP_NO_JSON',
      'error',
      'ZIP内に会話JSONが見つかりませんでした。ChatGPTまたはClaudeのエクスポートを選んでください。',
      sourceFile,
    ));
    return { entries: [], warnings, errors };
  }

  const entries = Object.entries(extracted)
    .map(([name, entryBytes]) => ({
      name: safeFileName(name),
      bytes: entryBytes,
      likelyConversationJson: isLikelyConversationJson(boundedEntryBaseName(name)),
      sourceIdentityHash: stableIdentityHash(['zip-entry', name]),
    }))
    .sort((left, right) => left.name.localeCompare(right.name, 'en'));
  if (entries.length === 0) {
    errors.push(diagnostic(
      'ZIP_NO_READABLE_JSON',
      'error',
      'ZIP内のJSONを読み取れませんでした。ファイルを展開し、会話JSONを直接選んでください。',
      sourceFile,
    ));
  }
  return { entries, warnings, errors };
};
