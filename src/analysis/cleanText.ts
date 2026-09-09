export const DEFAULT_MAX_ANALYSIS_LENGTH = 100_000;

export interface CleanTextOptions {
  excludeCode?: boolean;
  excludeQuotes?: boolean;
  maxLength?: number;
}

export interface CleanTextResult {
  text: string;
  truncated: boolean;
  /** Exact UTF-16 spans with explicit inline-identifier evidence in the source. */
  identifierSpans?: ReadonlyArray<{ index: number; end: number }>;
}

// Internal provenance delimiters are removed from input before we insert them.
// They never reach cleaned text, morphology, context, storage or exported images.
const IDENTIFIER_OPEN = '\uFDD0';
const IDENTIFIER_CLOSE = '\uFDD1';
const INLINE_IDENTIFIER = /^(?:[A-Za-z_][A-Za-z\d_]*(?:\.[A-Za-z_][A-Za-z\d_]*)*|[A-Za-z](?:\+\+|#))$/u;
const isInlineIdentifier = (content: string): boolean => content.length <= 64 && INLINE_IDENTIFIER.test(content);

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<>]+/giu;
const LONG_HASH_PATTERN = /\b(?:[a-f\d]{24,}|[A-Za-z\d_-]{40,})\b/gu;
const WINDOWS_PATH_PATTERN = /(?:^|\s)[A-Za-z]:\\(?:[^\s\\/:*?"<>|]+\\)+[^\s\\/:*?"<>|]*/gmu;
const UNIX_PATH_PATTERN = /(?:^|\s)\/(?:Users|home|var|tmp|private|opt|etc)\/(?:[^\s/]+\/)*[^\s]*/gmu;
// ChatGPT renders these private-use-delimited references as citation controls,
// not prose. Only remove complete known markers, with a bounded single-line
// payload; ordinary "cite", unknown controls, and malformed text remain intact.
const PROVIDER_CITATION_PATTERN = /\uE200(?:cite|filecite)\uE202[^\uE200\uE201\r\n]{1,4096}\uE201/gu;
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

// Structured source notation is not natural-language evidence. A newline is a
// hard phrase boundary in BOTH Japanese and English (ordinary spaces are valid
// inside English noun phrases). Never join words across removed private/source
// material merely because its contents are no longer part of the analysis text.
// Only complete delimiters are recognized; an unmatched "$" in prose survives.
const inlineSourceReplacement = (_match: string, _fence: string, content: string): string => {
  // Names such as React, useEffect and Node.js remain topic evidence when
  // typeset as inline code. Preserve only one bounded identifier, never an
  // expression, path, URL or arbitrary source snippet; retain hard boundaries.
  if (!isInlineIdentifier(content)) return '\n';
  return `\n${IDENTIFIER_OPEN}${content}${IDENTIFIER_CLOSE}\n`;
};

const removeSourceNotation = (text: string): string => text
  .replace(/(`+)([^`\n]+)\1/gu, inlineSourceReplacement)
  .replace(/\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)/gu, '\n')
  .replace(/\$\$[\s\S]*?\$\$/gu, '\n')
  .replace(/(?<![\w$])\$(?!\s|\d)([^$\n]+)\$(?!\w)/gu, '\n')
  .replace(/\\[A-Za-z]+\*?/gu, '\n')
  .replace(/^\s*[\w.-]+@[\w.-]+\s+[^\n]{0,200}?[%$#]\s[^\n]*$/gmu, '\n');

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
    .replace(/[\uFDD0\uFDD1]/gu, '\n')
    .normalize('NFKC')
    .replace(/\r\n?/gu, '\n'));

  if (excludeCode) text = removeSourceNotation(removeFencedCode(text));
  if (excludeQuotes) text = text.replace(/^\s{0,3}>.*$/gmu, '\n');
  text = text.replace(PROVIDER_CITATION_PATTERN, '\n');

  // Keep Markdown anchor text while discarding its potentially sensitive target.
  // Boundaries prevent a cleaned phrase spanning markup that the original
  // context cannot highlight; phrases wholly inside the visible label remain.
  text = text.replace(/\[([^\]\n]{1,500})\]\([^\s)]+(?:\s+["'][^"']*["'])?\)/gu, '\n$1\n');
  text = text
    .replace(EMAIL_PATTERN, '\n')
    .replace(URL_PATTERN, '\n')
    .replace(LONG_HASH_PATTERN, '\n')
    .replace(WINDOWS_PATH_PATTERN, '\n')
    .replace(UNIX_PATH_PATTERN, '\n')
    // Mandatory redaction can remove an otherwise valid identifier (e.g. a
    // long hash). Discard its provenance before final whitespace normalization.
    .replace(/\uFDD0([^\uFDD0\uFDD1]*)\uFDD1/gu, (match: string, content: string) =>
      isInlineIdentifier(content) ? match : content)
    .replace(/[^\S\n]+/gu, ' ')
    .replace(/ *\n */gu, '\n')
    .replace(/\n+/gu, '\n')
    .trim();

  const identifierSpans: Array<{ index: number; end: number }> = [];
  let plain = '';
  let opened: number | null = null;
  for (const character of text) {
    if (character === IDENTIFIER_OPEN) opened = plain.length;
    else if (character === IDENTIFIER_CLOSE) {
      if (opened !== null && isInlineIdentifier(plain.slice(opened))) {
        identifierSpans.push({ index: opened, end: plain.length });
      }
      opened = null;
    } else plain += character;
  }
  text = plain;

  const safeLimit = Number.isFinite(maxLength) ? Math.max(0, Math.floor(maxLength)) : DEFAULT_MAX_ANALYSIS_LENGTH;
  const truncated = text.length > safeLimit;
  if (truncated) text = text.slice(0, safeLimit).trimEnd();
  // A cut identifier has no complete source evidence for a noun-POS override.
  const completeSpans = identifierSpans.filter((span) => span.end <= text.length);
  return { text, truncated, ...(completeSpans.length ? { identifierSpans: completeSpans } : {}) };
};

export const cleanText = (input: string, options: CleanTextOptions = {}): string =>
  cleanTextDetailed(input, options).text;
