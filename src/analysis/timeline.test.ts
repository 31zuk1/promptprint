import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_ANALYSIS_SETTINGS,
  type AnalysisSettings,
  type MessageRole,
  type NormalizedConversation,
  type Provider,
} from '../domain/models';
import { CLOUD_WIDTH, isTermWithinBounds, laidOutTermsOverlap } from './layout';
import { analyzeConversations, prepareAnalysisDocuments } from './pipeline';
import {
  buildTimelineFrames,
  CALENDAR_DAY_MS,
  dateKey,
  MAX_TIMELINE_FRAMES,
  parseDateKey,
  resolveMessageDate,
  validateDateRange,
} from './timeline';

const at = (key: string): number => {
  const value = parseDateKey(key);
  if (value === null) throw new Error('Invalid synthetic test date');
  return value;
};
const settings = (overrides: Partial<AnalysisSettings> = {}): AnalysisSettings => ({
  ...DEFAULT_ANALYSIS_SETTINGS, includePhrases: false, minDocumentFrequency: 1, ...overrides,
});
const conversation = (
  id: string,
  messages: Array<{ at: number | null; role?: MessageRole; text?: string }>,
  options: { createdAt?: number | null; updatedAt?: number | null; provider?: Provider } = {},
): NormalizedConversation => {
  const provider = options.provider ?? 'demo';
  return {
    id, title: `合成テスト ${id}`, provider,
    createdAt: options.createdAt ?? null, updatedAt: options.updatedAt ?? null,
    messages: messages.map((message, index) => ({
      id: `${id}-${index}`, conversationId: id, provider,
      role: message.role ?? 'user', createdAt: message.at, order: index,
      originalText: message.text ?? 'signal', analysisText: message.text ?? 'signal',
    })),
  };
};

afterEach(() => vi.restoreAllMocks());

describe('strict JST calendar helpers', () => {
  it('changes date exactly at JST midnight, including epoch zero', () => {
    expect(dateKey(Date.parse('2026-02-28T14:59:59.999Z'))).toBe('2026-02-28');
    expect(dateKey(Date.parse('2026-02-28T15:00:00.000Z'))).toBe('2026-03-01');
    expect(parseDateKey('2026-03-01')).toBe(Date.parse('2026-02-28T15:00:00.000Z'));
    expect(dateKey(0)).toBe('1970-01-01');
    expect(parseDateKey('1970-01-01')).toBe(-9 * 60 * 60 * 1000);
    expect(dateKey(Number.NaN)).toBe('');
    expect(dateKey(Number.POSITIVE_INFINITY)).toBe('');
    expect(dateKey(8.64e15)).toBe('');
  });

  it.each(['2026-02-29', '2026-02-30', '2026-04-31', '2026-13-01', '2026-00-01',
    '0000-01-01', '2026-01-00', '2026-1-01', '2026-01-1', ' 2026-01-01', '2026-01-01 ',
    '2026-01-01T00:00:00Z', '', 'not-a-date'])('rejects non-calendar date %s', (key) => {
    expect(parseDateKey(key)).toBeNull();
  });

  it('supports Gregorian leap rules and years below 100 without the 1900 conversion', () => {
    for (const key of ['0001-01-01', '0099-12-31', '2000-02-29', '2024-02-29', '9999-12-31']) {
      expect(dateKey(at(key))).toBe(key);
    }
    expect(parseDateKey('1900-02-29')).toBeNull();
    expect(parseDateKey('2100-02-29')).toBeNull();
  });

  it('permits one-sided open dates, rejects invalid/reversed dates with safe diagnostics', () => {
    expect(validateDateRange('', '')).toBeNull();
    expect(validateDateRange('2026-01-01', '')).toBeNull();
    expect(validateDateRange('', '2026-01-01')).toBeNull();
    expect(validateDateRange('2026-01-01', '2026-01-01')).toBeNull();
    expect(validateDateRange('2026-02-01', '2026-01-01')).toContain('開始日は終了日以前');
    expect(validateDateRange('private-source-value', '')).toContain('開始日を有効な日付');
    expect(validateDateRange('private-source-value', '')).not.toContain('private-source-value');
    expect(validateDateRange('', '2026-02-30')).toContain('終了日を有効な日付');
  });
});

describe('calendar timeline frames', () => {
  it('keeps every day including leap day and an otherwise empty middle period', () => {
    expect(buildTimelineFrames('2024-02-28', '2024-03-01', 'day', 'window')).toEqual([
      { startDate: '2024-02-28', endDate: '2024-02-28', label: '2024-02-28' },
      { startDate: '2024-02-29', endDate: '2024-02-29', label: '2024-02-29' },
      { startDate: '2024-03-01', endDate: '2024-03-01', label: '2024-03-01' },
    ]);
    expect(buildTimelineFrames('2024-02-29', '2024-02-29', 'day', 'cumulative')).toHaveLength(1);
  });

  it('clips first/last partial months without rolling January 31 into March', () => {
    expect(buildTimelineFrames('2024-01-31', '2024-03-02', 'month', 'window')).toEqual([
      { startDate: '2024-01-31', endDate: '2024-01-31', label: '2024-01' },
      { startDate: '2024-02-01', endDate: '2024-02-29', label: '2024-02' },
      { startDate: '2024-03-01', endDate: '2024-03-02', label: '2024-03' },
    ]);
    expect(buildTimelineFrames('2026-12-31', '2027-01-02', 'month', 'window')).toEqual([
      { startDate: '2026-12-31', endDate: '2026-12-31', label: '2026-12' },
      { startDate: '2027-01-01', endDate: '2027-01-02', label: '2027-01' },
    ]);
  });

  it.each(['day', 'month'] as const)('keeps the original start in cumulative %s frames', (step) => {
    const frames = buildTimelineFrames('2024-01-31', '2024-03-02', step, 'cumulative');
    expect(frames.every((frame) => frame.startDate === '2024-01-31')).toBe(true);
    expect(frames.at(-1)?.endDate).toBe('2024-03-02');
    expect(frames).toEqual(buildTimelineFrames('2024-01-31', '2024-03-02', step, 'cumulative'));
  });

  it('allows exactly 366 frames and refuses the entire oversized range', () => {
    expect(MAX_TIMELINE_FRAMES).toBe(366);
    expect(buildTimelineFrames('2024-01-01', '2024-12-31', 'day', 'window')).toHaveLength(366);
    expect(buildTimelineFrames('2024-01-01', '2025-01-01', 'day', 'window')).toEqual([]);
    expect(buildTimelineFrames('2000-01-01', '2030-06-30', 'month', 'window')).toHaveLength(366);
    expect(buildTimelineFrames('2000-01-01', '2030-07-01', 'month', 'window')).toEqual([]);
  });

  it.each([['', '2026-01-01'], ['2026-01-01', ''], ['2026-02-30', '2026-03-01'],
    ['2026-03-01', '2026-02-28']])('requires a finite valid range (%s → %s)', (start, end) => {
    expect(buildTimelineFrames(start, end, 'day', 'window')).toEqual([]);
    expect(buildTimelineFrames(start, end, 'month', 'cumulative')).toEqual([]);
  });
});

describe('date filtering and coverage through the analysis pipeline', () => {
  it('uses inclusive JST days with an exclusive following midnight and preserves source fields', () => {
    const start = at('2026-02-01');
    const corpus = [conversation('boundary', [
      { at: start - 1 }, { at: start },
      { at: start + CALENDAR_DAY_MS - 1, role: 'assistant' },
      { at: start + CALENDAR_DAY_MS, role: 'assistant' },
    ])];
    const original = structuredClone(corpus);
    const selected = settings({ timeRange: 'custom', startDate: '2026-02-01', endDate: '2026-02-01' });
    const prepared = prepareAnalysisDocuments(corpus, selected);
    expect(prepared.documents.map((document) => document.message.id)).toEqual(['boundary-1', 'boundary-2']);
    const result = analyzeConversations(corpus, selected);
    expect(result.summary).toMatchObject({ userMessageCount: 1, assistantMessageCount: 1,
      dateStart: start, dateEnd: start + CALENDAR_DAY_MS - 1 });
    expect(result.timeline).toMatchObject({ startDate: '2026-01-31', endDate: '2026-02-02',
      appliedRange: { startDate: '2026-02-01', endDate: '2026-02-01' } });
    expect(corpus).toEqual(original);
  });

  it.each([
    { startDate: '2026-02-02', endDate: '', expected: ['open-1', 'open-2'] },
    { startDate: '', endDate: '2026-02-02', expected: ['open-0', 'open-1'] },
    { startDate: '', endDate: '', expected: ['open-0', 'open-1', 'open-2'] },
  ])('supports open range $startDate → $endDate while excluding undated messages',
    ({ startDate, endDate, expected }) => {
      const corpus = [conversation('open', [
        { at: at('2026-02-01') }, { at: at('2026-02-02') }, { at: at('2026-02-03') }, { at: null },
      ])];
      const result = prepareAnalysisDocuments(corpus, settings({ timeRange: 'custom', startDate, endDate }));
      expect(result.documents.map((document) => document.message.id)).toEqual(expected);
      expect(result.timeline.appliedRange).toEqual({ startDate, endDate });
      const all = analyzeConversations(corpus, settings({ startDate: 'invalid-but-unused' }));
      expect(all.summary.userMessageCount).toBe(4);
      expect(all.timeline?.appliedRange).toBeUndefined();
      expect(all.diagnostics.some((item) => item.code === 'INVALID_DATE_RANGE')).toBe(false);
    });

  it.each([
    { startDate: '2026-02-30', endDate: '' },
    { startDate: '', endDate: '2026-13-01' },
    { startDate: '2026-03-01', endDate: '2026-02-01' },
  ])('never falls back to all history for invalid/reversed custom input %j', (range) => {
    const corpus = [conversation('invalid', [{ at: at('2026-02-01') }, { at: null }])];
    const result = analyzeConversations(corpus, settings({ timeRange: 'custom', ...range }));
    expect(result.summary).toMatchObject({ conversationCount: 0, userMessageCount: 0,
      assistantMessageCount: 0, dateStart: null, dateEnd: null });
    expect(result.terms).toEqual([]);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'INVALID_DATE_RANGE' }));
    expect(result.timeline).toMatchObject({ datedMessageCount: 1, undatedMessageCount: 1,
      startDate: '2026-02-01', endDate: '2026-02-01' });
    expect(result.timeline?.appliedRange).toBeUndefined();
  });

  it('prefers valid message → conversation-created → conversation-updated dates, including zero', () => {
    const created = at('2026-01-01');
    const updated = at('2026-03-01');
    const item = conversation('fallback', [{ at: at('2026-02-01') }, { at: null }, { at: Number.NaN }, { at: 0 }],
      { createdAt: created, updatedAt: updated });
    expect(item.messages.map((message) => resolveMessageDate(item, message))).toEqual([
      { timestamp: at('2026-02-01'), fallback: false }, { timestamp: created, fallback: true },
      { timestamp: created, fallback: true }, { timestamp: 0, fallback: false },
    ]);
    const result = analyzeConversations([item], settings());
    expect(result.summary).toMatchObject({ dateStart: 0, dateEnd: at('2026-02-01') });
    expect(result.timeline).toMatchObject({ startDate: '1970-01-01', endDate: '2026-02-01',
      datedMessageCount: 4, undatedMessageCount: 0, fallbackMessageCount: 2 });
    const invalid = conversation('invalid-fallback', [{ at: Infinity }], { createdAt: NaN, updatedAt: updated });
    expect(resolveMessageDate(invalid, invalid.messages[0]!)).toEqual({ timestamp: updated, fallback: true });
    invalid.updatedAt = -Infinity;
    expect(resolveMessageDate(invalid, invalid.messages[0]!)).toEqual({ timestamp: null, fallback: false });
    expect(analyzeConversations([item], settings({ timeRange: 'custom', startDate: '1970-01-01',
      endDate: '1970-01-01' })).summary.userMessageCount).toBe(1);
  });

  it('computes provider-only coverage before filtering and includes content-noise-only dates', () => {
    const corpus = [
      conversation('chat', [{ at: at('2026-04-01') }, { at: at('2026-04-03'), text: '。', role: 'assistant' },
        { at: null }], { provider: 'chatgpt' }),
      conversation('fallback', [{ at: null }], { provider: 'chatgpt', createdAt: at('2026-04-02'),
        updatedAt: at('2026-04-05') }),
      conversation('claude', [{ at: at('2026-12-31') }], { provider: 'claude' }),
    ];
    const result = analyzeConversations(corpus, settings({ provider: 'chatgpt', timeRange: 'custom',
      startDate: '2026-04-02', endDate: '2026-04-02' }));
    expect(result.timeline).toEqual({ startDate: '2026-04-01', endDate: '2026-04-03', datedMessageCount: 3,
      undatedMessageCount: 1, fallbackMessageCount: 1,
      appliedRange: { startDate: '2026-04-02', endDate: '2026-04-02' }, sourceProviders: ['chatgpt'] });
    expect(result.summary).toMatchObject({ conversationCount: 1, providers: ['chatgpt'], userMessageCount: 1 });
    const all = analyzeConversations(corpus, settings());
    expect(all.timeline?.endDate).toBe('2026-12-31');
    expect(all.timeline?.datedMessageCount).toBe(4);
    expect(all.timeline?.sourceProviders).toEqual(['chatgpt', 'claude']);
    expect(analyzeConversations([...corpus].reverse(), settings()).timeline?.sourceProviders)
      .toEqual(all.timeline?.sourceProviders);
    const emptyChatGptPeriod = analyzeConversations(corpus, settings({ provider: 'chatgpt', timeRange: 'custom',
      startDate: '2026-04-04', endDate: '2026-04-04' }));
    expect(emptyChatGptPeriod.summary.providers).toEqual([]);
    expect(emptyChatGptPeriod.timeline?.sourceProviders).toEqual(['chatgpt']);
  });

  it.each([
    ['30d', '2026-02-01'], ['90d', '2025-12-03'], ['1y', '2025-03-03'],
  ] as const)('uses exactly the JST calendar range for %s', (timeRange, startDate) => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-03-01T15:00:00.000Z'));
    const start = at(startDate);
    const endExclusive = at('2026-03-03');
    const corpus = [conversation('relative', [{ at: start - 1 }, { at: start },
      { at: endExclusive - 1 }, { at: endExclusive }, { at: null }])];
    const result = analyzeConversations(corpus, settings({ timeRange }));
    expect(result.summary.userMessageCount).toBe(2);
    expect(result.summary).toMatchObject({ dateStart: start, dateEnd: endExclusive - 1 });
    expect(result.timeline?.appliedRange).toEqual({ startDate, endDate: '2026-03-02' });
  });

  it('renders an empty period as empty, without reusing the preceding cloud or losing the selected window', () => {
    const corpus = [conversation('empty-day', [{ at: at('2026-01-01') }, { at: at('2026-01-03') }])];
    const frames = buildTimelineFrames('2026-01-01', '2026-01-03', 'day', 'window');
    const results = frames.map((frame) => analyzeConversations(corpus, settings({ timeRange: 'custom', ...frame })));
    expect(results.map((result) => result.summary.userMessageCount)).toEqual([1, 0, 1]);
    expect(results[1]?.layout).toEqual([]);
    expect(results[1]?.contexts).toEqual({});
    expect(results[1]?.timeline?.appliedRange).toEqual({ startDate: '2026-01-02', endDate: '2026-01-02' });
    expect(results[1]?.timeline?.startDate).toBe('2026-01-01');
    expect(results[1]?.summary.providers).toEqual([]);
    expect(results[1]?.timeline?.sourceProviders).toEqual(['demo']);
    const belowThreshold = analyzeConversations(corpus, settings({ timeRange: 'custom',
      startDate: '2026-01-01', endDate: '2026-01-01', minDocumentFrequency: 2 }));
    expect(belowThreshold.layout).toEqual([]);
    expect(belowThreshold.summary.userMessageCount).toBe(1);
    const empty = analyzeConversations([], settings());
    expect(empty.timeline).toEqual({ startDate: null, endDate: null, datedMessageCount: 0,
      undatedMessageCount: 0, fallbackMessageCount: 0, sourceProviders: [] });
  });

  it('assigns boundary messages to one window only and cumulative windows retain preceding messages', () => {
    const corpus = [conversation('unique', [
      { at: at('2024-01-31') }, { at: at('2024-02-01') - 1 },
      { at: at('2024-02-01') }, { at: at('2024-03-01') - 1 }, { at: at('2024-03-01') },
    ])];
    const collect = (mode: 'window' | 'cumulative') =>
      buildTimelineFrames('2024-01-31', '2024-03-01', 'month', mode).map((frame) =>
        prepareAnalysisDocuments(corpus, settings({ timeRange: 'custom', ...frame })).documents
          .map((document) => document.message.id));
    const windows = collect('window');
    expect(windows.map((ids) => ids.length)).toEqual([2, 2, 1]);
    expect(new Set(windows.flat()).size).toBe(5);
    expect(collect('cumulative').map((ids) => ids.length)).toEqual([2, 4, 5]);
  });

  it('preserves per-frame denominators, side meaning, geometry, and deterministic analysis', () => {
    const corpus = [conversation('meaning', [
      { at: at('2026-01-01'), text: 'alpha alpha' }, { at: at('2026-01-01'), text: '。' },
      { at: at('2026-01-01'), text: 'bravo', role: 'assistant' },
      { at: at('2026-01-01'), text: '。', role: 'assistant' },
      { at: at('2026-01-03'), text: 'bravo' },
      { at: at('2026-01-03'), text: 'alpha', role: 'assistant' },
    ])];
    const frames = buildTimelineFrames('2026-01-01', '2026-01-03', 'day', 'window');
    for (const frame of frames) {
      const selected = settings({ timeRange: 'custom', ...frame });
      const first = analyzeConversations(corpus, selected);
      expect(analyzeConversations(corpus, selected)).toEqual(first);
      for (const [index, term] of first.layout.entries()) {
        expect(isTermWithinBounds(term)).toBe(true);
        if (term.biasLabel === 'user') expect(term.x + term.width / 2).toBeLessThan(CLOUD_WIDTH / 2);
        if (term.biasLabel === 'assistant') expect(term.x - term.width / 2).toBeGreaterThan(CLOUD_WIDTH / 2);
        expect(first.layout.slice(index + 1).some((other) => laidOutTermsOverlap(term, other))).toBe(false);
      }
    }
    const first = analyzeConversations(corpus, settings({ timeRange: 'custom', ...frames[0]! }));
    expect(first.terms.find((term) => term.term === 'alpha')).toMatchObject({
      userMessageCount: 2, assistantMessageCount: 2, dfUser: 1, dfAssistant: 0,
      rateUser: 0.5, rateAssistant: 0, tokenFrequencyUser: 2, tokenTotalUser: 2,
      per1000TokensUser: 1000, conversationCoverage: 1, biasLabel: 'user',
    });
    const last = analyzeConversations(corpus, settings({ timeRange: 'custom', ...frames[2]! }));
    expect(last.terms.find((term) => term.term === 'alpha')).toMatchObject({
      userMessageCount: 1, assistantMessageCount: 1, rateUser: 0, rateAssistant: 1, biasLabel: 'assistant',
    });
    const cumulative = buildTimelineFrames('2026-01-01', '2026-01-03', 'day', 'cumulative');
    const both = analyzeConversations(corpus, settings({ timeRange: 'custom', ...cumulative[2]! }));
    expect(both.terms.find((term) => term.term === 'alpha')).toMatchObject({
      userMessageCount: 3, assistantMessageCount: 3, rateUser: 1 / 3, rateAssistant: 1 / 3,
      biasLabel: 'shared', bias: 0,
    });
  });
});
