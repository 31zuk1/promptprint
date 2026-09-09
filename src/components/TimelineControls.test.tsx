import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzeConversations } from '../analysis/pipeline';
import { DEFAULT_ANALYSIS_SETTINGS, type AnalysisResult, type AnalysisSettings } from '../domain/models';
import { TimelineControls } from './TimelineControls';

type Range = { startDate: string; endDate: string };
type Props = ComponentProps<typeof TimelineControls>;

// No source conversations are needed to verify asynchronous playback. Empty results
// deliberately retain the requested window even when their observed summary has no dates.
const resultFor = (appliedRange?: Range, extent: Range = {
  startDate: '2026-01-01', endDate: '2026-03-31',
}): AnalysisResult => ({
  ...analyzeConversations([], DEFAULT_ANALYSIS_SETTINGS),
  timeline: {
    ...extent, datedMessageCount: 0, undatedMessageCount: 0, fallbackMessageCount: 0,
    ...(appliedRange ? { appliedRange } : {}),
  },
});

/** Reflect the real apps: a requested setting takes effect immediately, but the
 * previous completed result remains visible until a matching worker response arrives. */
const mountControls = (initial: Partial<Omit<Props, 'onChange'>> = {}) => {
  let props: Props;
  const onChange = vi.fn((next: AnalysisSettings) => {
    props = { ...props, settings: next, busy: true };
    view.rerender(<TimelineControls {...props} />);
  });
  props = { settings: { ...DEFAULT_ANALYSIS_SETTINGS }, result: resultFor(),
    busy: false, blocked: false, pauseKey: 0, ...initial, onChange };
  const view = render(<TimelineControls {...props} />);
  const update = (next: Partial<Omit<Props, 'onChange'>>) => act(() => {
    props = { ...props, ...next };
    view.rerender(<TimelineControls {...props} />);
  });
  const complete = (range?: Range) => {
    const requested = range ?? { startDate: props.settings.startDate, endDate: props.settings.endDate };
    update({ busy: false, result: resultFor(requested) });
  };
  return { onChange, update, complete, unmount: view.unmount,
    settings: () => props.settings, result: () => props.result };
};

const advance = (milliseconds: number) => act(() => vi.advanceTimersByTime(milliseconds));
const startPlayback = () => fireEvent.click(screen.getByRole('button', { name: '時系列を再生' }));
const stopPlayback = () => fireEvent.click(screen.getByRole('button', { name: '再生を停止' }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
});
afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('TimelineControls completed-result playback', () => {
  it('waits arbitrarily long for completion, then dwells before exactly one next request', () => {
    const harness = mountControls();
    startPlayback();
    expect(harness.onChange).toHaveBeenCalledTimes(1);
    expect(harness.settings()).toMatchObject({ timeRange: 'custom',
      startDate: '2026-01-01', endDate: '2026-01-31' });
    expect(screen.getByRole('button', { name: '再生を停止' })).toBeEnabled();
    expect(screen.getByTestId('timeline-current-period')).toHaveTextContent('全期間');
    advance(24 * 60 * 60 * 1000);
    expect(harness.onChange).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);

    // A busy flag changing without a new completed result is not an acknowledgement.
    harness.update({ busy: false });
    advance(60_000);
    expect(harness.onChange).toHaveBeenCalledTimes(1);
    harness.complete();
    expect(screen.getByTestId('timeline-current-period')).toHaveTextContent('2026-01-01 – 2026-01-31');
    expect(vi.getTimerCount()).toBe(1);
    advance(1999);
    expect(harness.onChange).toHaveBeenCalledTimes(1);
    advance(1);
    expect(harness.onChange).toHaveBeenCalledTimes(2);
    expect(harness.settings()).toMatchObject({ startDate: '2026-02-01', endDate: '2026-02-28' });
    expect(screen.getByTestId('timeline-current-period')).toHaveTextContent('2026-01-01 – 2026-01-31');
    advance(24 * 60 * 60 * 1000);
    expect(harness.onChange).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('allows stopping while busy and never advances after the delayed completion', () => {
    const harness = mountControls();
    startPlayback();
    stopPlayback();
    expect(screen.getByRole('button', { name: '時系列を再生' })).toBeDisabled();
    advance(60_000);
    harness.complete();
    expect(screen.getByRole('button', { name: '時系列を再生' })).toBeEnabled();
    expect(screen.getByTestId('timeline-current-period')).toHaveTextContent('2026-01-01 – 2026-01-31');
    advance(60_000);
    expect(harness.onChange).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['pauseKey', 'blocked'] as const)('cancels the scheduled dwell when %s changes', (guard) => {
    const harness = mountControls();
    startPlayback();
    harness.complete();
    expect(vi.getTimerCount()).toBe(1);
    harness.update(guard === 'pauseKey' ? { pauseKey: 1 } : { blocked: true });
    expect(vi.getTimerCount()).toBe(0);
    advance(60_000);
    harness.update({ blocked: false });
    advance(60_000);
    expect(harness.onChange).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '時系列を再生' })).toBeInTheDocument();
  });

  it.each(['pauseKey', 'blocked'] as const)('does not revive playback after a busy-stage %s pause', (guard) => {
    const harness = mountControls();
    startPlayback();
    harness.update(guard === 'pauseKey' ? { pauseKey: 1 } : { blocked: true });
    harness.complete();
    harness.update({ blocked: false });
    advance(60_000);
    expect(harness.onChange).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears its timer when the document hides and does not resume on visibility return', () => {
    const hidden = vi.spyOn(document, 'hidden', 'get');
    const harness = mountControls();
    startPlayback();
    harness.complete();
    expect(vi.getTimerCount()).toBe(1);
    hidden.mockReturnValue(true);
    fireEvent(document, new Event('visibilitychange'));
    expect(vi.getTimerCount()).toBe(0);
    advance(60_000);
    hidden.mockReturnValue(false);
    fireEvent(document, new Event('visibilitychange'));
    advance(60_000);
    expect(harness.onChange).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '時系列を再生' })).toBeEnabled();
  });

  it('refuses to start while hidden, busy, or blocked', () => {
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    const harness = mountControls();
    startPlayback();
    expect(harness.onChange).not.toHaveBeenCalled();
    hidden.mockReturnValue(false);
    harness.update({ busy: true });
    startPlayback();
    harness.update({ busy: false, blocked: true });
    startPlayback();
    expect(harness.onChange).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the timer and visibility listener on unmount', () => {
    const remove = vi.spyOn(document, 'removeEventListener');
    const harness = mountControls();
    startPlayback();
    harness.complete();
    expect(vi.getTimerCount()).toBe(1);
    harness.unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(remove).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    advance(60_000);
    expect(harness.onChange).toHaveBeenCalledTimes(1);
  });

  it('stops automatically after the only frame completes', () => {
    const harness = mountControls({ result: resultFor(undefined,
      { startDate: '2026-01-15', endDate: '2026-01-15' }) });
    startPlayback();
    expect(screen.getByRole('button', { name: '再生を停止' })).toBeEnabled();
    harness.complete();
    expect(screen.getByRole('button', { name: '時系列を再生' })).toBeEnabled();
    expect(screen.getByRole('status')).toHaveTextContent('1 / 1 時点');
    advance(60_000);
    expect(harness.onChange).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops at the final frame without wrapping or requesting a duplicate', () => {
    const harness = mountControls();
    startPlayback();
    for (let count = 1; count <= 3; count += 1) {
      expect(harness.onChange).toHaveBeenCalledTimes(count);
      harness.complete();
      if (count < 3) advance(2000);
    }
    expect(screen.getByRole('button', { name: '時系列を再生' })).toBeEnabled();
    expect(screen.getByRole('status')).toHaveTextContent('3 / 3 時点');
    expect(screen.getByTestId('timeline-current-period')).toHaveTextContent('2026-03-01 – 2026-03-31');
    advance(60_000);
    expect(harness.onChange).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops when the returned completed range does not match the pending frame', () => {
    const harness = mountControls();
    startPlayback();
    harness.complete({ startDate: '2026-02-01', endDate: '2026-02-28' });
    expect(screen.getByRole('button', { name: '時系列を再生' })).toBeEnabled();
    advance(60_000);
    expect(harness.onChange).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops on a manual non-date filter change and does not continue with a stale frame cursor', () => {
    const harness = mountControls();
    startPlayback();
    harness.complete();
    expect(vi.getTimerCount()).toBe(1);
    harness.update({ settings: { ...harness.settings(), provider: 'chatgpt' }, busy: true });
    expect(vi.getTimerCount()).toBe(0);
    harness.complete();
    advance(60_000);
    expect(harness.onChange).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '時系列を再生' })).toBeEnabled();
    expect(screen.getByRole('status')).not.toHaveTextContent('1 / 3 時点');
  });

  it('refreshes the editable window only when an external relative preset completes', () => {
    const harness = mountControls();
    const range = { startDate: '2026-02-01', endDate: '2026-03-02' };
    harness.update({ settings: { ...harness.settings(), timeRange: '30d' }, busy: true, pauseKey: 1 });
    expect(screen.getByLabelText('開始日')).toHaveValue('2026-01-01');
    expect(screen.getByLabelText('終了日')).toHaveValue('2026-03-31');
    harness.complete(range);
    expect(screen.getByLabelText('開始日')).toHaveValue('2026-02-01');
    expect(screen.getByLabelText('終了日')).toHaveValue('2026-03-02');
    startPlayback();
    harness.complete();
    // Completion of the first automatic frame must not shrink the playback window.
    expect(screen.getByLabelText('終了日')).toHaveValue('2026-03-02');
    advance(2000);
    expect(harness.onChange).toHaveBeenCalledTimes(2);
    expect(harness.settings()).toMatchObject({ startDate: '2026-03-01', endDate: '2026-03-02' });
  });

  it.each([
    { timeRange: 'all' as const, range: undefined },
    { timeRange: '30d' as const, range: { startDate: '2026-02-01', endDate: '2026-03-02' } },
    { timeRange: '90d' as const, range: { startDate: '2025-12-03', endDate: '2026-03-02' } },
    { timeRange: '1y' as const, range: { startDate: '2025-03-03', endDate: '2026-03-02' } },
  ])('recognizes its own $timeRange → custom transition without pausing', ({ timeRange, range }) => {
    const harness = mountControls({ settings: { ...DEFAULT_ANALYSIS_SETTINGS, timeRange }, result: resultFor(range) });
    startPlayback();
    expect(harness.settings().timeRange).toBe('custom');
    expect(screen.getByRole('button', { name: '再生を停止' })).toBeEnabled();
    harness.complete();
    advance(2000);
    expect(harness.onChange).toHaveBeenCalledTimes(2);
  });

  it('labels completed empty results, never in-flight settings or observed source dates', () => {
    const initialRange = { startDate: '2026-02-10', endDate: '2026-02-12' };
    const harness = mountControls({ result: resultFor(initialRange),
      settings: { ...DEFAULT_ANALYSIS_SETTINGS, timeRange: 'custom', ...initialRange } });
    expect(harness.result().summary.dateStart).toBeNull();
    expect(harness.result().layout).toEqual([]);
    expect(screen.getByTestId('timeline-current-period')).toHaveTextContent('2026-02-10 – 2026-02-12');
    harness.update({ settings: { ...harness.settings(), startDate: '2026-03-01', endDate: '2026-03-03' }, busy: true });
    expect(screen.getByTestId('timeline-current-period')).toHaveTextContent('2026-02-10 – 2026-02-12');
    harness.complete();
    expect(screen.getByTestId('timeline-current-period')).toHaveTextContent('2026-03-01 – 2026-03-03');
    harness.update({ result: resultFor({ startDate: '', endDate: '2026-03-15' }) });
    expect(screen.getByTestId('timeline-current-period')).toHaveTextContent('指定なし – 2026-03-15');
    harness.update({ result: resultFor() });
    expect(screen.getByTestId('timeline-current-period')).toHaveTextContent('全期間');
    expect(harness.onChange).not.toHaveBeenCalled();
  });
});
