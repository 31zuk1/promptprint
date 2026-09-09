import type { NormalizedConversation, NormalizedMessage } from '../domain/models';

export const MAX_TIMELINE_FRAMES = 366;
export const CALENDAR_DAY_MS = 86_400_000;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export type TimelineStep = 'day' | 'month';
export type TimelineMode = 'window' | 'cumulative';

export interface TimelineFrame {
  startDate: string;
  endDate: string;
  label: string;
}

/** Calendar keys always use JST, independently of the host's time zone. */
export const dateKey = (timestamp: number): string => {
  if (!Number.isFinite(timestamp)) return '';
  const shifted = new Date(timestamp + JST_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  if (!Number.isFinite(shifted.getTime()) || year < 1 || year > 9999) return '';
  return shifted.toISOString().slice(0, 10);
};

/** Strict YYYY-MM-DD to the inclusive day's start in JST; never rolls invalid dates. */
export const parseDateKey = (value: string): number | null => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  // setUTCFullYear avoids Date.UTC's special conversion of years 00–99 to 1900–1999.
  const calendar = new Date(0);
  calendar.setUTCHours(0, 0, 0, 0);
  calendar.setUTCFullYear(year, month - 1, day);
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 ||
      calendar.getUTCDate() !== day) return null;
  return calendar.getTime() - JST_OFFSET_MS;
};

export const validateDateRange = (start: string, end: string): string | null => {
  const startTime = parseDateKey(start);
  const endTime = parseDateKey(end);
  if (start !== '' && startTime === null) return '開始日を有効な日付（YYYY-MM-DD）で指定してください。';
  if (end !== '' && endTime === null) return '終了日を有効な日付（YYYY-MM-DD）で指定してください。';
  if (startTime !== null && endTime !== null && startTime > endTime) {
    return '開始日は終了日以前の日付を指定してください。';
  }
  return null;
};

export interface ResolvedMessageDate {
  timestamp: number | null;
  fallback: boolean;
}

/** Prefer the visible message's date; never substitute a fetch time or the current time. */
export const resolveMessageDate = (
  conversation: NormalizedConversation,
  message: NormalizedMessage,
): ResolvedMessageDate => {
  const candidates = [message.createdAt, conversation.createdAt, conversation.updatedAt];
  for (const [index, timestamp] of candidates.entries()) {
    if (timestamp !== null && dateKey(timestamp) !== '') {
      return { timestamp, fallback: index > 0 };
    }
  }
  return { timestamp: null, fallback: false };
};

/** Empty calendar periods stay in the sequence; oversized sequences are refused, not truncated. */
export const buildTimelineFrames = (
  start: string,
  end: string,
  step: TimelineStep,
  mode: TimelineMode,
): TimelineFrame[] => {
  const startTime = parseDateKey(start);
  const endTime = parseDateKey(end);
  if (startTime === null || endTime === null || startTime > endTime ||
      (step !== 'day' && step !== 'month') || (mode !== 'window' && mode !== 'cumulative')) return [];
  const frames: TimelineFrame[] = [];
  let current = startTime;
  while (current <= endTime) {
    if (frames.length >= MAX_TIMELINE_FRAMES) return [];
    let next = current + CALENDAR_DAY_MS;
    if (step === 'month') {
      const calendar = new Date(current + JST_OFFSET_MS);
      calendar.setUTCDate(1);
      calendar.setUTCMonth(calendar.getUTCMonth() + 1);
      next = calendar.getTime() - JST_OFFSET_MS;
    }
    const frameStart = dateKey(mode === 'cumulative' ? startTime : current);
    const frameEnd = dateKey(Math.min(endTime, next - CALENDAR_DAY_MS));
    frames.push({ startDate: frameStart, endDate: frameEnd,
      label: step === 'day' ? frameEnd : frameEnd.slice(0, 7) });
    current = next;
  }
  return frames;
};
