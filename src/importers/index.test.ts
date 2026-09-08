import { strToU8, zipSync } from 'fflate';

import activeBranchFixture from '../test/fixtures/chatgpt-active-branch.json';
import claudeFixture from '../test/fixtures/claude-representative.json';
import malformedJson from '../test/fixtures/malformed.json?raw';
import type { SerializableFile } from '../domain/models';
import {
  importSerializableFiles,
  MAX_TOTAL_INPUT_BYTES,
  MAX_TOTAL_NORMALIZED_CONVERSATIONS,
  MAX_TOTAL_NORMALIZED_MESSAGES,
} from './index';

const arrayBufferFromBytes = (bytes: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
};

const jsonFile = (name: string, value: unknown): SerializableFile => {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return {
    name,
    type: 'application/json',
    size: bytes.byteLength,
    bytes: arrayBufferFromBytes(bytes),
  };
};

describe('importSerializableFiles', () => {
  it('exposes fixed aggregate retention caps', () => {
    expect(MAX_TOTAL_NORMALIZED_CONVERSATIONS).toBe(20_000);
    expect(MAX_TOTAL_NORMALIZED_MESSAGES).toBe(200_000);
  });

  it('imports ChatGPT JSON through provider detection', async () => {
    const result = await importSerializableFiles([
      jsonFile('conversations.json', activeBranchFixture),
    ]);

    expect(result.conversations).toHaveLength(1);
    expect(result.conversations[0]?.provider).toBe('chatgpt');
    expect(result.diagnostics.conversationsParsed).toBe(1);
    expect(result.diagnostics.messagesParsed).toBe(3);
  });

  it('imports a representative Claude JSON', async () => {
    const result = await importSerializableFiles([
      jsonFile('claude-export.json', claudeFixture),
    ]);

    expect(result.conversations).toHaveLength(2);
    expect(result.conversations.every((conversation) => conversation.provider === 'claude')).toBe(true);
  });

  it('finds an aggregate conversations.json inside a ZIP', async () => {
    const archive = zipSync({
      'export/conversations.json': strToU8(JSON.stringify(activeBranchFixture)),
      'export/user.json': strToU8('{"email":"private@example.invalid"}'),
    });
    const result = await importSerializableFiles([{
      name: 'chatgpt-export.zip',
      type: 'application/zip',
      size: archive.byteLength,
      bytes: arrayBufferFromBytes(archive),
    }]);

    expect(result.conversations).toHaveLength(1);
    expect(result.conversations[0]?.provider).toBe('chatgpt');
    expect(JSON.stringify(result.diagnostics)).not.toContain('private@example.invalid');
  });

  it('imports likely numbered files beside conversations.json and reports unrelated JSON skips', async () => {
    const numberedConversation = [{
      id: 'numbered-chat',
      title: '番号付き会話',
      messages: [
        { role: 'user', content: '番号付きの質問' },
        { role: 'assistant', content: '番号付きの回答' },
      ],
    }];
    const archive = zipSync({
      'export/conversations.json': strToU8(JSON.stringify(activeBranchFixture)),
      'export/001.json': strToU8(JSON.stringify(numberedConversation)),
      'export/user.json': strToU8('{"email":"private@example.invalid"}'),
    });
    const result = await importSerializableFiles([{
      name: 'mixed-export.zip',
      type: 'application/zip',
      size: archive.byteLength,
      bytes: arrayBufferFromBytes(archive),
    }]);

    expect(result.conversations.map((conversation) => conversation.title))
      .toEqual(['番号付き会話', '分岐のある会話']);
    expect(result.diagnostics.recordsSkipped).toBeGreaterThanOrEqual(1);
    expect(result.diagnostics.warnings.some((item) => item.code === 'ZIP_UNLIKELY_JSON_SKIPPED'))
      .toBe(true);
    expect(JSON.stringify(result.diagnostics)).not.toContain('private@example.invalid');
  });

  it('keeps a long-path conversations.json selected beside another likely ZIP entry', async () => {
    const privateTail = 'RAW_PRIVATE_PATH_SENTINEL';
    const longConversationPath = `${'directory/'.repeat(24)}${privateTail}/conversations.json`;
    const numberedConversation = [{
      id: 'numbered-long-path-peer',
      title: '番号付き会話',
      messages: [{ role: 'user', content: '番号付き本文' }],
    }];
    const archive = zipSync({
      [longConversationPath]: strToU8(JSON.stringify(activeBranchFixture)),
      '001.json': strToU8(JSON.stringify(numberedConversation)),
    });
    const result = await importSerializableFiles([{
      name: 'long-path-export.zip',
      type: 'application/zip',
      size: archive.byteLength,
      bytes: arrayBufferFromBytes(archive),
    }]);

    expect(result.conversations.map((conversation) => conversation.title))
      .toEqual(['番号付き会話', '分岐のある会話']);
    expect(result.diagnostics.warnings.some((item) => item.code === 'ZIP_UNLIKELY_JSON_SKIPPED'))
      .toBe(false);
    expect(JSON.stringify(result.diagnostics)).not.toContain(privateTail);
  });

  it('does not confuse likely and unrelated entries whose sanitized paths collide', async () => {
    const sharedPrefix = 'same-private-directory-prefix/'.repeat(10);
    const conversationPath = `${sharedPrefix}conversations.json`;
    const unrelatedPath = `${sharedPrefix}user.json`;
    const archive = zipSync({
      [conversationPath]: strToU8(JSON.stringify(activeBranchFixture)),
      [unrelatedPath]: strToU8('{"email":"private@example.invalid"}'),
    });
    const result = await importSerializableFiles([{
      name: 'colliding-display-paths.zip',
      type: 'application/zip',
      size: archive.byteLength,
      bytes: arrayBufferFromBytes(archive),
    }]);

    expect(result.conversations).toHaveLength(1);
    expect(result.diagnostics.warnings.find((item) => item.code === 'ZIP_UNLIKELY_JSON_SKIPPED')?.message)
      .toContain('1件');
    expect(JSON.stringify(result.diagnostics)).not.toContain('private@example.invalid');
  });

  it('uses opaque full-path identities when likely ZIP display paths collide', async () => {
    const sharedPrefix = 'same-opaque-source-prefix/'.repeat(12);
    const repeatedConversation = [{
      id: 'same-raw-conversation-id',
      messages: [{ id: 'same-raw-message-id', role: 'user', content: 'identityprobe' }],
    }];
    const archive = zipSync({
      [`${sharedPrefix}001.json`]: strToU8(JSON.stringify(repeatedConversation)),
      [`${sharedPrefix}002.json`]: strToU8(JSON.stringify(repeatedConversation)),
    });
    const result = await importSerializableFiles([{
      name: 'opaque-source-paths.zip',
      type: 'application/zip',
      size: archive.byteLength,
      bytes: arrayBufferFromBytes(archive),
    }]);
    const conversationIds = result.conversations.map((conversation) => conversation.id);
    const messageIds = result.conversations.flatMap((conversation) =>
      conversation.messages.map((message) => message.id));

    expect(result.conversations).toHaveLength(2);
    expect(result.conversations[0]?.sourceFile).toBe(result.conversations[1]?.sourceFile);
    expect(new Set(conversationIds).size).toBe(2);
    expect(new Set(messageIds).size).toBe(2);
  });

  it('shares one message budget across files and skips later sources without parsing them', async () => {
    const first = jsonFile('first.json', [{
      id: 'first',
      messages: [
        { role: 'user', content: '一つ目' },
        { role: 'assistant', content: '二つ目' },
        { role: 'user', content: '同一ファイル内の予算外メッセージ' },
      ],
    }]);
    const malformedBytes = new TextEncoder().encode('{"private":"UNPARSED_SENTINEL"');
    const result = await importSerializableFiles([
      first,
      {
        name: 'later-malformed.json',
        type: 'application/json',
        size: malformedBytes.byteLength,
        bytes: arrayBufferFromBytes(malformedBytes),
      },
    ], { maxMessages: 2 });

    expect(result.conversations).toHaveLength(1);
    expect(result.diagnostics.errors).toEqual([]);
    expect(result.diagnostics.warnings.filter((item) => item.code === 'IMPORT_AGGREGATE_LIMIT'))
      .toHaveLength(1);
    expect(result.diagnostics.warnings.find((item) => item.code === 'IMPORT_AGGREGATE_LIMIT')?.message)
      .toContain('後続ファイル／ZIP項目1件');
    expect(result.diagnostics.warnings.find((item) => item.code === 'IMPORT_AGGREGATE_LIMIT')?.message)
      .toContain('メッセージ候補1件');
    expect(JSON.stringify(result.conversations)).not.toContain('同一ファイル内の予算外メッセージ');
    expect(JSON.stringify(result.diagnostics)).not.toContain('UNPARSED_SENTINEL');
  });

  it('shares the conversation budget across sorted ZIP entries and reports skipped entries', async () => {
    const conversation = (id: string, text: string): unknown => [{
      id,
      messages: [{ role: 'user', content: text }],
    }];
    const archive = zipSync({
      '001.json': strToU8(JSON.stringify(conversation('first', '保持される会話'))),
      '002.json': strToU8('{"private":"UNPARSED_ZIP_SENTINEL"'),
      '003.json': strToU8(JSON.stringify(conversation('third', '予算外の会話'))),
    });
    const result = await importSerializableFiles([{
      name: 'many-conversations.zip',
      type: 'application/zip',
      size: archive.byteLength,
      bytes: arrayBufferFromBytes(archive),
    }], { maxConversations: 1 });

    expect(result.conversations.map((item) => item.title)).toEqual(['無題の会話']);
    expect(result.conversations[0]?.messages[0]?.originalText).toBe('保持される会話');
    expect(result.diagnostics.errors).toEqual([]);
    expect(result.diagnostics.warnings.filter((item) => item.code === 'IMPORT_AGGREGATE_LIMIT'))
      .toHaveLength(1);
    expect(result.diagnostics.warnings.find((item) => item.code === 'IMPORT_AGGREGATE_LIMIT')?.message)
      .toContain('後続ファイル／ZIP項目2件');
    expect(JSON.stringify(result)).not.toMatch(/UNPARSED_ZIP_SENTINEL|予算外の会話/);
  });

  it('returns a safe Japanese error for malformed JSON', async () => {
    const bytes = new TextEncoder().encode(malformedJson);
    const result = await importSerializableFiles([{
      name: 'broken.json',
      type: 'application/json',
      size: bytes.byteLength,
      bytes: arrayBufferFromBytes(bytes),
    }]);

    expect(result.conversations).toEqual([]);
    expect(result.diagnostics.errors[0]?.code).toBe('JSON_PARSE_FAILED');
    expect(result.diagnostics.errors[0]?.message).toContain('JSON');
    expect(JSON.stringify(result.diagnostics)).not.toContain('途中で壊れたJSON');
  });

  it('rejects unrelated JSON without echoing private values', async () => {
    const result = await importSerializableFiles([
      jsonFile('unrelated.json', { secret: 'RAW_PRIVATE_SENTINEL', settings: true }),
    ]);
    const rendered = JSON.stringify(result.diagnostics);

    expect(result.conversations).toEqual([]);
    expect(result.diagnostics.errors[0]?.code).toBe('JSON_UNSUPPORTED_SHAPE');
    expect(rendered).not.toContain('RAW_PRIVATE_SENTINEL');
  });

  it('reports empty ZIP archives and oversized selections without throwing', async () => {
    const emptyArchive = zipSync({});
    const emptyResult = await importSerializableFiles([{
      name: 'empty.zip',
      type: 'application/zip',
      size: emptyArchive.byteLength,
      bytes: arrayBufferFromBytes(emptyArchive),
    }]);
    expect(emptyResult.diagnostics.errors[0]?.code).toBe('ZIP_EMPTY');

    const oversizedResult = await importSerializableFiles([{
      name: 'too-large.json',
      type: 'application/json',
      size: MAX_TOTAL_INPUT_BYTES + 1,
      bytes: new ArrayBuffer(0),
    }]);
    expect(oversizedResult.diagnostics.errors[0]?.code).toBe('TOTAL_INPUT_TOO_LARGE');
  });
});
