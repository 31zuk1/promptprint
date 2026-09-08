import {
  detectJsonProvider,
  MAX_IMPORT_TIMESTAMP_MS,
  timestampValue,
} from './detect';

describe('timestampValue', () => {
  it('normalizes supported seconds, milliseconds, and ISO timestamps', () => {
    expect(timestampValue(1_725_148_800)).toBe(1_725_148_800_000);
    expect(timestampValue(1_725_148_800_000)).toBe(1_725_148_800_000);
    expect(timestampValue('2026-01-02T03:04:05.000Z'))
      .toBe(Date.parse('2026-01-02T03:04:05.000Z'));
  });

  it('rejects invalid, pre-epoch, and implausibly distant dates', () => {
    expect(timestampValue(Number.POSITIVE_INFINITY)).toBeNull();
    expect(timestampValue(-1)).toBeNull();
    expect(timestampValue(MAX_IMPORT_TIMESTAMP_MS + 1)).toBeNull();
    expect(timestampValue('9999-12-31T23:59:59.999Z')).toBeNull();
  });
});

describe('detectJsonProvider', () => {
  const minimalMessages = [{ role: 'user', content: '質問' }, { role: 'assistant', content: '回答' }];

  it('recognizes minimal Claude chats/messages and a Claude filename hint', () => {
    expect(detectJsonProvider({ chats: [{ messages: minimalMessages }] }, 'export.json').provider)
      .toBe('claude');
    expect(detectJsonProvider([{ messages: minimalMessages }], 'claude-export.json').provider)
      .toBe('claude');
  });

  it('keeps ambiguous plain role/content messages on the ChatGPT path without a Claude hint', () => {
    expect(detectJsonProvider([{ messages: minimalMessages }], 'conversations.json').provider)
      .toBe('chatgpt');
  });
});
