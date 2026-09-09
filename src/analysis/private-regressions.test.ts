import { describe, expect, it } from 'vitest';
import { DEFAULT_ANALYSIS_SETTINGS, type TermStats } from '../domain/models';
import { parseChatGptExport } from '../importers/chatgpt';
import { layoutTermsDetailed } from './layout';
import { analyzeConversations } from './pipeline';

// Synthetic-only regressions for live-history shapes. No real message, account,
// identifier, credential, or private fixture belongs in this file.
const visibleUser = {
  id: 'synthetic-user', author: { role: 'user' }, recipient: 'all',
  content: { content_type: 'text', parts: ['可視本文 研究'] },
};
const visibleAssistant = {
  id: 'synthetic-final', author: { role: 'assistant' }, recipient: 'all', channel: 'final',
  content: { content_type: 'text', parts: ['可視回答 検証'] },
};

describe('private history normalization safeguards', () => {
  const hiddenVariants = [
    { channel: 'analysis', content: { content_type: 'text', parts: ['INTERNALSENTINEL'] } },
    { metadata: { channel: 'analysis' }, content: { content_type: 'text', parts: ['INTERNALSENTINEL'] } },
    { content: { content_type: 'reasoning_recap', content: 'INTERNALSENTINEL' } },
    { content: { content_type: 'thoughts', text: 'INTERNALSENTINEL' } },
    { metadata: { is_visually_hidden_from_conversation: true }, content: { content_type: 'text', parts: ['INTERNALSENTINEL'] } },
  ];

  it.each(hiddenVariants)('excludes internal content before contexts/statistics/persistence: %#', (variant) => {
    const hidden = { id: 'synthetic-internal', author: { role: 'assistant' }, recipient: 'all', ...variant };
    const imported = parseChatGptExport({ id: 'synthetic-thread', current_node: 'answer', mapping: {
      user: { parent: null, message: visibleUser },
      internal: { parent: 'user', message: hidden },
      answer: { parent: 'internal', message: visibleAssistant },
      discarded: { parent: 'user', message: { ...visibleAssistant, content: { content_type: 'text', parts: ['DISCARDEDSENTINEL'] } } },
    } });
    expect(imported.conversations[0]?.messages.map((message) => message.originalText))
      .toEqual(['可視本文 研究', '可視回答 検証']);
    const result = analyzeConversations(imported.conversations, {
      ...DEFAULT_ANALYSIS_SETTINGS, minDocumentFrequency: 1, includePhrases: false,
    });
    expect(result.summary).toMatchObject({ conversationCount: 1, userMessageCount: 1, assistantMessageCount: 1 });
    expect(JSON.stringify(result)).not.toMatch(/INTERNALSENTINEL|DISCARDEDSENTINEL/i);
  });

  it('excludes nested reasoning blocks from otherwise visible multimodal text', () => {
    const imported = parseChatGptExport({ id: 'synthetic-mixed', messages: [visibleUser, {
      ...visibleAssistant,
      content: { content_type: 'multimodal_text', parts: [
        '可視回答 検証',
        { type: 'reasoning', text: 'INTERNALSENTINEL' },
        { content_type: 'reasoning_recap', content: 'INTERNALSENTINEL' },
        { content_type: 'image_asset_pointer', asset_pointer: 'not-a-real-asset' },
      ] },
    }] });
    expect(imported.conversations[0]?.messages[1]?.originalText).toBe('可視回答 検証');
    expect(imported.conversations[0]?.messages.every((message) => message.createdAt === null)).toBe(true);
  });

  it('preserves legacy, final and visible commentary text without manufacturing dates', () => {
    const imported = parseChatGptExport({ id: 'synthetic-visible', messages: [
      visibleUser,
      { ...visibleAssistant, id: 'legacy', channel: null },
      { ...visibleAssistant, id: 'commentary', channel: 'commentary' },
      visibleAssistant,
    ] });
    expect(imported.conversations[0]?.messages.map((message) => message.role))
      .toEqual(['user', 'assistant', 'assistant', 'assistant']);
    expect(imported.conversations[0]?.messages.map((message) => message.createdAt))
      .toEqual([null, null, null, null]);
  });

  it('deduplicates repeated source message IDs only after selecting the active branch', () => {
    const imported = parseChatGptExport({ id: 'synthetic-duplicates', current_node: 'active-copy', mapping: {
      discarded: { parent: 'user', message: { ...visibleAssistant, content: { content_type: 'text', parts: ['DISCARDEDSENTINEL'] } } },
      user: { parent: null, message: visibleUser },
      active: { parent: 'user', message: visibleAssistant },
      'active-copy': { parent: 'active', message: visibleAssistant },
    } });
    expect(imported.conversations[0]?.messages.map((message) => message.originalText))
      .toEqual(['可視本文 研究', '可視回答 検証']);
    expect(imported.diagnostics.recordsSkipped).toBe(1);
  });

  it('deduplicates identical source IDs but keeps repeated text with distinct IDs', () => {
    const imported = parseChatGptExport({ id: 'synthetic-direct-duplicates', messages: [
      visibleUser, visibleUser, { ...visibleUser, id: 'another-legitimate-turn' }, visibleAssistant,
    ] });
    expect(imported.conversations[0]?.messages.map((message) => message.role))
      .toEqual(['user', 'user', 'assistant']);
    expect(imported.diagnostics.recordsSkipped).toBe(1);
  });
});

const measuredTerm = (index: number, bias: number): TermStats => ({
  term: `synthetic-${index}`, display: index % 3 ? `語彙${index}` : `長い日本語の複合語${index}`,
  kind: 'word', dfUser: 120 - index, dfAssistant: 1, rateUser: 0.5, rateAssistant: 0.1,
  userMessageCount: 240, assistantMessageCount: 10,
  tokenFrequencyUser: 120 - index, tokenFrequencyAssistant: 1,
  tokenTotalUser: 1000, tokenTotalAssistant: 100, per1000TokensUser: 120 - index, per1000TokensAssistant: 10,
  bias, biasLabel: bias > 0 ? 'user' : 'assistant', importance: 120 - index,
  conversationCoverage: 120 - index, providerCoverage: ['demo'], rawFrequency: 121 - index,
});

describe('private history size interpretation', () => {
  it.each([40, 80, 120])('keeps retained font sizes monotone for %i crowded mixed-length words', (count) => {
    const terms = Array.from({ length: count }, (_, index) => measuredTerm(index, index % 2 ? 0.8 : -0.8));
    const first = layoutTermsDetailed(terms, 'private-size-contract');
    expect(first).toEqual(layoutTermsDetailed(terms, 'private-size-contract'));
    expect(first.layout.length).toBeGreaterThan(0);
    const byImportance = [...first.layout].sort((a, b) => a.importance - b.importance);
    for (let index = 1; index < byImportance.length; index += 1) {
      expect(byImportance[index]!.fontSize).toBeGreaterThanOrEqual(byImportance[index - 1]!.fontSize);
    }
    expect(first.layout.length + first.omitted.length).toBe(count);
  });
});
