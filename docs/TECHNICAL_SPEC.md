# Promptprint PoC — Technical specification

## 1. Architecture

Promptprint is a static, client-only application:

```text
File or synthetic demo source
  -> provider adapter
  -> normalized conversations and messages
  -> worker-based cleaning and tokenization
  -> term statistics and insights
  -> deterministic layout
  -> React dashboard and local context index
  -> privacy-safe PNG export
```

Use:

- Vite;
- React;
- TypeScript in strict mode;
- pnpm;
- a Web Worker for expensive parsing and analysis;
- a small browser-capable ZIP reader such as `fflate`;
- Vitest and Testing Library;
- Playwright;
- ESLint;
- a small DOM-to-image dependency only if it is necessary for reliable export.

Do not introduce a backend, database, remote API, analytics SDK, remote font, CDN script, or runtime package loading.

## 2. Module boundaries

A suitable layout is:

```text
src/
  app/
    App.tsx
    state.ts
  components/
    Landing.tsx
    ImportDropzone.tsx
    ImportProgress.tsx
    FilterBar.tsx
    StatsCards.tsx
    MirrorCloud.tsx
    TermTooltip.tsx
    TermContextDrawer.tsx
    InsightCards.tsx
    PrivacyBadge.tsx
    ExportButton.tsx
  domain/
    models.ts
    diagnostics.ts
  importers/
    detect.ts
    zip.ts
    chatgpt.ts
    claude.ts
  analysis/
    cleanText.ts
    tokenize.ts
    phrases.ts
    statistics.ts
    echo.ts
    adoption.ts
    layout.ts
    colors.ts
    contextIndex.ts
  workers/
    analysis.worker.ts
    protocol.ts
  demo/
    demoConversations.ts
  styles/
    tokens.css
    app.css
  test/
    fixtures/
public/
docs/
artifacts/
```

The exact names may differ. Import, analysis, layout, presentation, and worker protocol boundaries must remain explicit and unit-testable.

## 3. Domain model

```ts
export type Provider = "chatgpt" | "claude" | "demo";
export type MessageRole = "user" | "assistant";

export interface NormalizedConversation {
  id: string;
  provider: Provider;
  title: string;
  createdAt: number | null;
  updatedAt: number | null;
  messages: NormalizedMessage[];
  sourceFile?: string;
}

export interface NormalizedMessage {
  id: string;
  conversationId: string;
  provider: Provider;
  role: MessageRole;
  createdAt: number | null;
  order: number;
  originalText: string;
  analysisText: string;
}

export interface ImportDiagnostics {
  filesSeen: string[];
  conversationsParsed: number;
  messagesParsed: number;
  recordsSkipped: number;
  warnings: DiagnosticItem[];
  errors: DiagnosticItem[];
}
```

Imported values enter as `unknown`. Validate them with explicit type guards and bounded tolerant extractors. Never cast an entire input file to a trusted provider schema.

Stable synthetic identifiers are acceptable when source identifiers are missing. Stable order must survive normalization and filtering.

## 4. Input detection and ZIP handling

Accept `.json` and `.zip`.

For ZIP input:

1. list entries in memory without extracting to the filesystem;
2. ignore directories, hidden metadata, and obvious non-conversation assets;
3. search case-insensitively for `conversations.json`, numbered conversation JSON files, and likely Claude conversation JSON files;
4. cap archive entry count, aggregate uncompressed size, individual JSON size, and decompression work;
5. warn clearly for very large archives rather than freezing;
6. parse in a worker;
7. return diagnostics for unsupported and skipped entries.

The implementation may choose a practical hard limit, for example 500 MB input, and a warning threshold such as 200 MB. Record actual values in architecture and limitations documentation and keep the UI copy consistent.

Do not include private values in error messages. Safe metadata includes filenames, root type, bounded top-level key names, counts, and limit names.

## 5. ChatGPT adapter

### 5.1 Supported shapes

Support:

- a top-level array of graph conversations;
- an object with a `conversations` array;
- direct conversation objects with a `messages` array;
- multiple plausible conversation JSON files in one archive;
- missing title or timestamps.

### 5.2 Selected branch

Do not aggregate every graph branch.

For a graph conversation:

1. use `current_node` when it resolves to a valid node;
2. follow each `parent` reference to the root, with cycle and length guards;
3. reverse the path;
4. extract messages only from that path;
5. if `current_node` is absent or invalid, choose a usable leaf path ending at the most recent usable message, falling back to the longest usable path;
6. emit a warning when fallback selection is used.

The ChatGPT unit fixture must contain a discarded assistant branch with a unique sentinel. The sentinel must not appear in normalized messages, term statistics, or the cloud.

### 5.3 Message extraction

Include only roles normalized to `user` and `assistant`.

Skip:

- system, developer, context, and unknown control messages;
- tool calls and tool results;
- execution output;
- empty content;
- non-text attachment payloads.

Text extraction tolerates:

- string values in `content.parts`;
- rich-content arrays containing text blocks;
- direct `text` strings;
- direct `content` strings;
- multimodal structures where only bounded textual parts are retained.

Preserve original text for the volatile context index and tokenize only cleaned analysis text.

## 6. Claude adapter

Claude support is experimental. Use conservative shape detection instead of a brittle whole-file cast.

Recognize likely conversation arrays:

- a top-level array;
- `conversations`;
- `chats`.

Recognize message arrays:

- `chat_messages`;
- `messages`.

Recognize roles:

- `sender`;
- `role`;
- `author.role`.

Map `human` and `user` to `user`. Map `assistant`, `ai`, and `claude` to `assistant`.

Extract bounded textual content from:

- `text` strings;
- `content` strings;
- `content` arrays containing `{ type: "text", text: string }`;
- similar nested text blocks, using depth, item-count, and length caps.

For unsupported shapes:

- do not crash;
- report root type and a bounded list of safe top-level keys;
- suggest supplying an anonymized schema sample;
- never dump source content into diagnostics.

Mark Claude support as experimental in the landing screen, diagnostics, and `docs/LIMITATIONS.md`.

## 7. Cleaning pipeline

Implement pure, unit-tested transformations while keeping `originalText` unchanged.

Default cleaning:

1. normalize Unicode with NFKC;
2. normalize line endings;
3. remove fenced Markdown code blocks when enabled;
4. remove blockquote lines when enabled;
5. remove URLs, email-like strings, long hashes, and obvious file paths;
6. remove Markdown link destinations while retaining safe anchor text;
7. collapse repeated whitespace;
8. cap per-message analysis length and emit a safe warning when capped;
9. reject zero-width and control-character noise.

URL and email removal is always enabled. Do not claim perfect recognition of pasted articles, quotations, or all path formats.

## 8. Tokenization and filtering

### 8.1 Tokenizer contract

```ts
interface Tokenizer {
  tokenize(text: string, localeHint?: string): SurfaceToken[];
}
```

Baseline:

- use `Intl.Segmenter` with word granularity for mixed Japanese and English;
- lowercase Latin canonical forms;
- retain the most frequent original variant as display form;
- optionally use a small deterministic English stemmer;
- do not require a remotely downloaded dictionary.

If `Intl.Segmenter` is unavailable, use a deterministic local fallback and document the quality difference.

### 8.2 Noise filtering

Exclude:

- punctuation and whitespace;
- pure numbers and dates;
- URL or email remnants;
- Japanese and English stopwords;
- a small documented list of generic assistant scaffolding terms;
- one-character hiragana or katakana;
- Latin tokens shorter than two characters except a small whitelist such as `AI`, `VR`, `AR`, and `OZ`;
- symbol-dominated tokens.

Single CJK characters may be excluded by default with a small justified whitelist.

Store token sets per message for document frequency and ordered token arrays for phrase, context, and sequence analysis.

## 9. Phrase extraction

Support unigrams plus selected bigrams and trigrams. The words-only filter bypasses phrase candidates.

A phrase candidate:

- consists of adjacent content tokens;
- occurs in at least two or three distinct messages, depending on corpus size;
- appears in more than one conversation for normal-size corpora;
- passes normalized PMI or another documented deterministic association score;
- does not begin or end with a stopword;
- is not a near-duplicate formatting variant.

Prefer an informative phrase such as `海外大学院` or `北朝鮮 ネットワーク` when strongly associated, but do not globally suppress useful component words. Deduplicate only during top-term selection.

Cap candidate generation to avoid pathological memory or quadratic behavior.

## 10. Statistics

Use message-document frequency as the primary measure because assistant messages are usually longer.

For term `w` and role `r`:

```text
df_r(w)   = number of messages by role r containing w
m_r       = total analyzed messages by role r
rate_r(w) = (df_r(w) + alpha) / (m_r + 2 * alpha)
alpha     = 0.5
```

Role bias:

```text
rawBias(w)        = ln(rate_user(w) / rate_assistant(w))
normalizedBias(w) = tanh(rawBias(w) / 2)
```

Interpretation:

- near +1: user-dominant;
- near 0: shared;
- near -1: assistant-dominant.

The product convention places user terms on the left and AI terms on the right:

```text
xTarget = centerX - normalizedBias * usableHalfWidth
```

Importance:

```text
messageDf      = df_user + df_assistant
conversationDf = unique conversations containing the term
importance     = ln(1 + messageDf) *
                 (1 + 0.35 * ln(1 + conversationDf))
```

Raw term frequency may break ties only. Map importance to font size by quantiles or logarithmic scaling. A desktop range near 16–64 px is appropriate; scale deliberately for mobile.

## 11. Top-term selection

Before layout:

1. enforce automatic or user-selected minimum message-document frequency;
2. remove stopwords, noise, and hidden terms;
3. rank by robust importance;
4. preserve a useful mix of user-biased, shared, and AI-biased terms;
5. avoid filling slots with near-synonymous n-grams;
6. select the requested top N.

For 80 terms, a useful initial quota is up to 30 user-side, 20 shared, and 30 AI-side. Redistribute unused capacity.

## 12. Echo rate

Create adjacent user → assistant pairs inside each conversation. Ignore pairs with too little analyzable text.

```text
idf(w) = ln((N + 1) / (globalDf(w) + 1)) + 1

pairEcho =
  sum(idf(w) for w in userSet intersect assistantSet)
  / sum(idf(w) for w in userSet)
```

Aggregate pair scores with a weight equal to the square root of the number of salient user tokens so tiny prompts do not dominate.

Return:

- percentage;
- eligible pair count;
- confidence label based on sample size;
- the required caveat that this measures lexical reuse, not answer quality.

## 13. AI-first adoption candidates

Order messages by timestamp where present and stable import order otherwise.

A candidate must satisfy:

- first eligible occurrence is assistant-side;
- first user occurrence occurs in a later turn, preferably a later conversation;
- user uses the term in at least two later messages;
- user uses span at least two conversations when corpus size permits;
- overall document frequency clears the normal threshold;
- the term is neither a generic stopword nor an obvious quotation artifact.

Return evidence counts and first-seen dates. Mark results experimental and non-causal everywhere. Hide the card when evidence is insufficient.

## 14. Deterministic Mirror Cloud

Use an SVG viewBox around 1100 × 620.

Suggested algorithm:

1. measure each term with an offscreen canvas and exact font settings;
2. derive target x from normalized role bias;
3. derive stable target y from a hash of term and current filter signature;
4. sort terms by font size descending with stable tie breakers;
5. place rectangles using a deterministic expanding spiral or ring search around their targets;
6. reject collisions and positions outside padded bounds;
7. if placement fails, progressively omit or reduce the smallest terms and emit diagnostics;
8. never rotate terms by default;
9. cache by stable data and setting signatures where safe.

```ts
interface LaidOutTerm extends TermStats {
  x: number;
  y: number;
  fontSize: number;
  width: number;
  height: number;
  color: string;
}
```

Use browser-measured bounding boxes when possible. Approximation is acceptable only when visual and automated checks show no severe overlap or clipping.

Render interactive SVG text. Each term is keyboard-focusable and has an accessible name that summarizes side and frequency.

For viewports up to 620 px, derive a deterministic SVG overview of at most 24 terms from the already-filtered term set. Allocate equal provisional quotas to user, shared, and assistant labels, fill unused quota by global importance, and keep the full requested layout unchanged for the labelled detail mode. The overview uses three simultaneously visible semantic regions and a 13–22 px type range; the detail mode starts centered in a horizontally pannable SVG and reports left/center/right position visually.

Render the full-cloud opening at exactly `100svh`, then the analysis section in ordinary document flow. Do not insert a discovery/action rail or a smaller representative-cloud preview between them. The analysis toolbar may be sticky only inside the analysis section; the two section bounds must meet without negative margins, fixed cloud layers, or visual overlap. Filters never trigger automatic scrolling; the toolbar retains a `クラウド全体を見る` action for returning to the updated cloud.

Use one local-only visual system across rendered surfaces: `#FCFAF6` paper, plain typography, and one fixed monochrome SVG-turbulence grain layer. Keep the landing neutral, centered, and single-column, with full-width demo/file buttons stacked vertically and no permanent drop-zone frame. Reserve `linear-gradient(108deg, #EDF5FF 0%, #F7F2FF 48%, #FFF0E7 100%)` for visualization surfaces; do not add rainbow underlines to headings or brand marks. Do not animate the grain or stack separate noise layers on cards. Pointer hover on an SVG term uses `translateY(-2px) scale(1.015)` with a restrained drop shadow; keyboard focus does not move, and reduced-motion disables the transform and filter.

## 15. Color mapping

Use a semantic three-anchor interpolation:

- user: `#2563EB` or nearby blue;
- shared: `#7C3AED` or nearby violet;
- AI: `#F97316` or nearby orange.

Small deterministic variation by term hash is acceptable. Preserve contrast and semantic identity.

## 16. Worker protocol

The worker accepts serializable requests:

```ts
type WorkerRequest =
  | {
      type: "IMPORT_AND_ANALYZE";
      files: WorkerFilePayload[];
      settings: AnalysisSettings;
    }
  | {
      type: "ANALYZE_NORMALIZED";
      conversations: NormalizedConversation[];
      settings: AnalysisSettings;
    }
  | { type: "CANCEL" };
```

It emits:

- named stage progress;
- safe diagnostics;
- normalized summary;
- term statistics;
- insights;
- compact context references or indexes;
- layout input or results;
- recoverable errors.

Avoid repeatedly cloning large strings across the worker boundary. A practical design retains normalized messages in the worker and sends compact excerpts, or transfers them once and reuses identifiers.

Cancellation must be cooperative and leave the application reusable. Data clearing terminates the worker and starts a clean one only when needed.

## 17. State and persistence

React reducer/state or another small local state approach is sufficient.

Never persist raw conversations. Permitted preferences include:

- term-count choice;
- analysis filter toggles;
- dismissed onboarding state.

Use a Promptprint-namespaced key, keep values non-sensitive, and clear Promptprint-owned temporary state during the clear flow.

## 18. PNG export

Export the share card at 2× pixel density:

- wait for completed layout;
- hide tooltip, drawer, buttons, and other controls;
- include only aggregate counts and terms;
- honor hidden terms;
- use system/local fonts;
- reproduce the application paper, directional gradient, and deterministic subtle grain without rasterizing private DOM content;
- sanitize the filename;
- revoke object URLs after download.

If a DOM-to-image package is used, cover the integration lightly in unit tests and assert a non-empty PNG download in E2E. SVG serialization followed by canvas rasterization is preferred when it is more reliable.

## 19. Performance

Target 10,000 messages on a normal modern laptop without multi-second main-thread freezes.

- show named progress and cancellation;
- cap message length, archive work, nested traversal, phrase candidates, and stored contexts;
- avoid all-pairs term algorithms;
- use deterministic stable ordering;
- memoize analysis by dataset/settings signature when safe in volatile memory;
- report out-of-memory, malformed, or limit failures and preserve the landing state.

Targets are not claims. Record measured limitations.

## 20. Privacy verification

Browser tests intercept requests during demo and import. Allow only the same-origin local test server. Fail on unexpected third-party hosts.

Inspect the production bundle for:

- analytics or telemetry scripts;
- remote font requests;
- third-party API endpoints;
- runtime CDN scripts.

Test that:

- raw imported text is absent from browser storage;
- PNG output excludes raw excerpts and titles;
- hidden terms do not appear in export;
- clear-data releases application state and object URLs.

## 21. Required fixtures and tests

Unit fixtures:

- ChatGPT graph with active branch and discarded sentinel branch;
- ChatGPT direct-message shape;
- representative Claude conversation;
- malformed and unsupported JSON;
- hand-checkable demo expectations.

Unit coverage:

- active-branch selection;
- text-content extraction;
- cleaning toggles and mandatory redaction;
- mixed-language tokenization;
- bias sign and role normalization;
- phrase/word-only behavior;
- Echo rate and sample count;
- AI-first criteria;
- deterministic layout, bounds, and collision checks.

End-to-end coverage:

- landing and demo;
- populated cloud within two clicks;
- tooltip and context selection;
- filter-triggered recomputation;
- malformed import recovery;
- PNG download content type and non-zero size;
- clear-data reset;
- unexpected-network guard;
- browser-console error guard;
- desktop screenshot at `artifacts/promptprint-demo.png`;
- mobile operability.

## 22. Documentation

Maintain:

- `README.md`: exact setup, commands, export/import flow, privacy model, and screenshot;
- `docs/ARCHITECTURE.md`: data flow, modules, dependencies, formulas, limits, and privacy boundaries;
- `docs/LIMITATIONS.md`: provider schemas, heuristic NLP, causality, browser, and performance limits;
- `docs/EXECPLAN.md`: current progress, decisions, validation evidence, gaps, and recovery state.
