import { strToU8, zipSync } from 'fflate';

import {
  extractJsonEntriesFromZip,
  MAX_ZIP_ENTRIES,
  MAX_ZIP_JSON_ENTRY_BYTES,
} from './zip';

describe('extractJsonEntriesFromZip', () => {
  it('extracts JSON in memory and ignores assets and hidden metadata', () => {
    const archive = zipSync({
      'nested/conversations.json': strToU8('[]'),
      'nested/readme.txt': strToU8('not a conversation'),
      '__MACOSX/._conversations.json': strToU8('{"private":"ignored"}'),
      '.hidden.json': strToU8('{"private":"ignored"}'),
    });

    const result = extractJsonEntriesFromZip(archive, 'history.zip');

    expect(result.errors).toEqual([]);
    expect(result.entries.map((entry) => entry.name)).toEqual(['nested/conversations.json']);
  });

  it('classifies the raw bounded basename before truncating a long display path', () => {
    const privateTail = 'RAW_PRIVATE_PATH_SENTINEL';
    const rawPath = `${'directory/'.repeat(24)}${privateTail}/conversations.json`;
    const result = extractJsonEntriesFromZip(zipSync({ [rawPath]: strToU8('[]') }), 'long.zip');

    expect(result.errors).toEqual([]);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.name.length).toBeLessThanOrEqual(180);
    expect(result.entries[0]?.likelyConversationJson).toBe(true);
    expect(result.entries[0]?.name).not.toContain(privateTail);
  });

  it('reports an empty ZIP with a recoverable Japanese diagnostic', () => {
    const result = extractJsonEntriesFromZip(zipSync({}), 'empty.zip');

    expect(result.entries).toEqual([]);
    expect(result.errors[0]?.code).toBe('ZIP_EMPTY');
    expect(result.errors[0]?.message).toContain('空');
  });

  it('reports corrupted archives without throwing', () => {
    const result = extractJsonEntriesFromZip(
      new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]),
      'broken.zip',
    );

    expect(result.entries).toEqual([]);
    expect(result.errors[0]?.code).toBe('ZIP_READ_FAILED');
  });

  it('exposes a finite per-entry uncompressed-size cap', () => {
    expect(MAX_ZIP_JSON_ENTRY_BYTES).toBe(64 * 1024 * 1024);
  });

  it('rejects archives with too many total entries before returning extracted JSON', () => {
    const entries = Object.fromEntries(Array.from(
      { length: MAX_ZIP_ENTRIES + 1 },
      (_, index) => [`items/${index}.txt`, strToU8('x')],
    ));
    const result = extractJsonEntriesFromZip(zipSync(entries), 'too-many-entries.zip');

    expect(result.entries).toEqual([]);
    expect(result.errors[0]?.code).toBe('ZIP_ENTRY_LIMIT_EXCEEDED');
  });
});
