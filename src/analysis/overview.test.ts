import { describe, expect, it } from 'vitest';
import type { BiasLabel, TermStats } from '../domain/models';
import { createMobileOverviewLayout, createOverviewLayout } from './overview';

const makeTerm = (index: number, biasLabel: BiasLabel): TermStats => ({
  term: `${biasLabel}-${index}`,
  display: `${biasLabel}-${index}`,
  kind: 'word',
  dfUser: biasLabel === 'assistant' ? 1 : index + 2,
  dfAssistant: biasLabel === 'user' ? 1 : index + 2,
  rateUser: 0.1,
  rateAssistant: 0.1,
  bias: biasLabel === 'user' ? 0.8 : biasLabel === 'assistant' ? -0.8 : 0,
  biasLabel,
  importance: 20 - index,
  conversationCoverage: 10 - index,
  providerCoverage: ['demo'],
  rawFrequency: 30 - index,
});

describe('createOverviewLayout', () => {
  it('is deterministic, bounded, and preserves all semantic sides', () => {
    const terms = (['user', 'shared', 'assistant'] as const)
      .flatMap((side) => Array.from({ length: 12 }, (_, index) => makeTerm(index, side)));

    const first = createOverviewLayout(terms, 24, 'mobile');
    const second = createOverviewLayout(terms, 24, 'mobile');

    expect(first).toEqual(second);
    expect(first).toHaveLength(24);
    expect(new Set(first.map((term) => term.biasLabel))).toEqual(new Set(['user', 'shared', 'assistant']));
  });

  it('fills unused role quota from remaining important terms', () => {
    const terms = [
      ...Array.from({ length: 20 }, (_, index) => makeTerm(index, 'user')),
      makeTerm(0, 'shared'),
      makeTerm(0, 'assistant'),
    ];

    const overview = createOverviewLayout(terms, 12, 'sparse');

    expect(overview).toHaveLength(12);
    expect(overview.some((term) => term.biasLabel === 'shared')).toBe(true);
    expect(overview.some((term) => term.biasLabel === 'assistant')).toBe(true);
  });
});

describe('createMobileOverviewLayout', () => {
  it('creates a deterministic, readable 390px overview with three semantic bands', () => {
    const terms = (['user', 'shared', 'assistant'] as const)
      .flatMap((side) => Array.from({ length: 12 }, (_, index) => makeTerm(index, side)));

    const first = createMobileOverviewLayout(terms, 24);
    const second = createMobileOverviewLayout(terms, 24);

    expect(first).toEqual(second);
    expect(first).toHaveLength(24);
    expect(first.every((term) => term.fontSize >= 13 && term.fontSize <= 22)).toBe(true);
    expect(first.every((term) => term.x - term.width / 2 >= 8 && term.x + term.width / 2 <= 382)).toBe(true);
    expect(first.filter((term) => term.biasLabel === 'user').every((term) => term.x < 130)).toBe(true);
    expect(first.filter((term) => term.biasLabel === 'shared').every((term) => term.x > 130 && term.x < 260)).toBe(true);
    expect(first.filter((term) => term.biasLabel === 'assistant').every((term) => term.x > 260)).toBe(true);
  });
});
