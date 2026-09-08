export const DEFAULT_MAX_ANALYSIS_LENGTH = 100_000;

export interface CleanTextOptions {
  excludeCode?: boolean;
  excludeQuotes?: boolean;
  maxLength?: number;
}

export interface CleanTextResult {
  text: string;
  truncated: boolean;
}

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<>]+/giu;
const LONG_HASH_PATTERN = /\b(?:[a-f\d]{24,}|[A-Za-z\d_-]{40,})\b/gu;
const WINDOWS_PATH_PATTERN = /(?:^|\s)[A-Za-z]:\\(?:[^\s\\/:*?"<>|]+\\)+[^\s\\/:*?"<>|]*/gmu;
const UNIX_PATH_PATTERN = /(?:^|\s)\/(?:Users|home|var|tmp|private|opt|etc)\/(?:[^\s/]+\/)*[^\s]*/gmu;
const removeControlNoise = (text: string): string => [...text].filter((character) => {
  const point = character.codePointAt(0) ?? 0;
  const disallowedControl =
    point <= 0x08 || point === 0x0b || point === 0x0c ||
    (point >= 0x0e && point <= 0x1f) || (point >= 0x7f && point <= 0x9f);
  const zeroWidthNoise =
    (point >= 0x200b && point <= 0x200d) || point === 0x2060 || point === 0xfeff;
  return !disallowedControl && !zeroWidthNoise;
}).join('');

const removeFencedCode = (text: string): string => {
  const lines = text.split('\n');
  const kept: string[] = [];
  let fence: '`' | '~' | null = null;
  let fenceLength = 0;

  for (const line of lines) {
    const opening = line.match(/^\s{0,3}(`{3,}|~{3,})/u);
    if (fence === null && opening?.[1]) {
      fence = opening[1][0] as '`' | '~';
      fenceLength = opening[1].length;
      kept.push('');
      continue;
    }

    if (fence !== null) {
      const closingPattern = new RegExp(`^\\s{0,3}${fence === '`' ? '`' : '~'}{${fenceLength},}\\s*$`, 'u');
      if (closingPattern.test(line)) {
        fence = null;
        fenceLength = 0;
      }
      kept.push('');
      continue;
    }

    kept.push(line);
  }

  return kept.join('\n');
};

/**
 * Produces analysis-only text. The caller must retain the untouched original text
 * separately for the context view.
 */
export const cleanTextDetailed = (
  input: string,
  options: CleanTextOptions = {},
): CleanTextResult => {
  const {
    excludeCode = true,
    excludeQuotes = true,
    maxLength = DEFAULT_MAX_ANALYSIS_LENGTH,
  } = options;

  let text = removeControlNoise(input
    .normalize('NFKC')
    .replace(/\r\n?/gu, '\n'));

  if (excludeCode) text = removeFencedCode(text);
  if (excludeQuotes) text = text.replace(/^\s{0,3}>.*$/gmu, ' ');

  // Keep Markdown anchor text while discarding its potentially sensitive target.
  text = text.replace(/\[([^\]\n]{1,500})\]\([^\s)]+(?:\s+["'][^"']*["'])?\)/gu, '$1');
  text = text
    .replace(EMAIL_PATTERN, ' ')
    .replace(URL_PATTERN, ' ')
    .replace(LONG_HASH_PATTERN, ' ')
    .replace(WINDOWS_PATH_PATTERN, ' ')
    .replace(UNIX_PATH_PATTERN, ' ')
    .replace(/\s+/gu, ' ')
    .trim();

  const safeLimit = Number.isFinite(maxLength) ? Math.max(0, Math.floor(maxLength)) : DEFAULT_MAX_ANALYSIS_LENGTH;
  if (text.length <= safeLimit) return { text, truncated: false };

  return {
    text: text.slice(0, safeLimit).trimEnd(),
    truncated: true,
  };
};

export const cleanText = (input: string, options: CleanTextOptions = {}): string =>
  cleanTextDetailed(input, options).text;
