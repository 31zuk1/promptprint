# Promptprint PoC — Technical specification

## Morphological topic-extraction architecture (redesign, 2026-09-09)

The production pipeline is now `cleanTextDetailed → extractLexicalTokensDetailed → extractNounPhrases → computeTermStatistics → display selection → layout`. `morphology.ts` uses pinned kuromoji 0.1.2 with packaged IPADIC; `englishMorphology.ts` uses pinned wink-pos-tagger 2.2.2 with its bundled English contextual model. The old `Intl.Segmenter`-only repair and arbitrary NPMI n-gram path are not the production extraction foundation. Legacy helper functions remain for compatibility tests, not as a silent fallback on dictionary failure.

Both analysis workers await `initializeMorphology()` before synchronous analysis. Initialization is deduplicated per worker; errors are safe Japanese failures, and a failed load can be retried. Only fixed same-origin or extension-packaged dictionary asset names are fetched; no text, token or account value enters those requests. Twelve gzip files total 17,791,956 bytes compressed and 100,260,388 bytes expanded, before indexes/lattice overhead. `scripts/morphology-assets.mjs` serves them in development and emits them, with upstream licenses/notices, into both static builds. The English model is JavaScript bundled into the worker; it makes no separate model request.

`AnalysisSettings.vocabularyFocus` defaults to `topics`; `all` retains broad vocabulary. Both modes share the exact `AnalysisDocument.words` ledger: observed source surfaces, lowercased/NFKC canonical forms, UTF-16 spans and occurrence-level `topicEligible` / `displayEligible` metadata. Lemmas are not substituted. Nominal usage means eligible nouns, not every Japanese UNKNOWN or English wordlike token. English adjectives may modify a phrase but are not standalone topic nouns. Japanese prefixes/suffixes and one-character noun atoms can contribute to a compound without being standalone topic labels. Exact procedural-word rules are presentation guards, not a topical whitelist. Grammar, punctuation and hidden-span removal creates gaps that no phrase can bridge.

For each production candidate, `topicEvidence.eligible = nounMessageCount / messageDf >= 0.5`: at least half of its distinct observed messages contain an eligible nominal occurrence. Measurements still count all accepted occurrences, including a surviving word's non-nominal uses. Default ranking is:

```text
D = dfUser + dfAssistant
C = number of selected conversations containing analyzed messages
c = candidate conversationCoverage
topicSelectionScore = ln(1 + D) × (1 + ln((C + 1) / (c + 1))) × D / (D + 2)
```

The support factor `D/(D+2)` suppresses weak evidence; inverse conversation frequency separates concentrated subjects from broad boilerplate. The `+1` floor preserves all-conversation themes. This replaces the earlier maximum-35% bonus for production candidates. It is not semantic relevance, statistical significance or a new size encoding. `TermStats.importance`, role rates and bias retain their original formulas. Broad mode ranks by importance. Side quotas and positional compound representation run only on eligible candidates; no fallback fills empty slots with rejected terms. Insights, adoption presentation and provider selections follow the same policy. `result.display` carries the completed focus/exclusion counts, not pending UI settings.

Noun phrases need two distinct messages, even within one conversation, and obey the grammar and bounds in section 9. The former cross-conversation/three-message exception and NPMI threshold no longer apply to the production extractor. The existing >=80%/at-least-two actual-position containment rule remains display-only. Dictionary-based counts may differ from older releases, but surviving-term measurements never differ solely because `topics` / `all` changes.

## Fixed-metric 3D alternative (2026-09-09)

`analysis/spatial.ts` maps current `result.layout` terms without mutation/reselection: X=−bias, Y=(rateUser+rateAssistant)/2 when both role denominators are nonzero (otherwise the observed rate), Z=conversationCoverage/summary.conversationCount. No available comparison produces X=0 and `comparisonAvailable=false`. Zero denominators produce zero coordinate, not evidence of equality. Ranges are clamped defensively to fixed [−1,1]/[0,1]/[0,1]. Orthographic yaw/pitch projection fits the eight fixed cube corners, never the observed term extrema; camera bounds are yaw ±65°, pitch 0–60°, zoom 0.8–1.2, with default −28°/20°/1.0.

`analysis/spatialScene.ts` supplies SVG and Canvas point depth order, edges, endpoint/tick labels and collision-free screen-space word-label boxes. Points are never displaced, dropped or enlarged for depth/importance. At most 28 desktop/10 mobile text labels are placed; a long display label is truncated to 14 code points including an ellipsis, without modifying its canonical term or original statistics. The selection menu retains every current point. Fixed 14 px labels and radius-5 dots are viewport presentation constants, uniformly scaled in PNG. The SVG uses actual container dimensions; PNG uses a fixed 1100×620 orthographic viewBox at uniform 1.4 scale. Equal camera/world values are shared; aspect ratio, not a data-dependent rescaling, explains different fitted pixel positions.

`SpatialCloud`, `VisualizationSwitch` and parent-local mode/camera state are shared by ordinary and private apps. They add no worker request, storage, fetch, runtime dependency, WebGL or permission. Camera/view operations increment the existing playback pause guard. Existing context selection snapshots remain unchanged. Point clicks/Enter use the same drawer/hide path; all co-located terms remain accessible through a select and 44 px context button. Mouse/pen drag starts on the empty canvas, touch scrolling stays native, and arrow handling is limited to the focused SVG itself. `exportSpatial.ts` renders aggregate-only points/labels using the shared scene; `exportPng.ts` keeps its original 2D and cancellation/revocation branches.

## Chronological preview implementation (2026-09-09)

`analysis/timeline.ts` provides strict `YYYY-MM-DD` parsing, fixed JST day keys, effective message timestamps and bounded deterministic day/month frames. Date filtering uses `[start 00:00 JST, day-after-end 00:00 JST)` and never host timezone or date-rollover normalization. Relative 30/90/365-day presets include today. Custom empty bounds are open; invalid/reversed input yields zero results plus `INVALID_DATE_RANGE`, never an all-data fallback.

`AnalysisResult.timeline` contains source extent, provider provenance, dated/undated/fallback counts before the date filter, and the committed applied range. Metadata contains no original text, title or identity. The normal worker keeps its existing volatile-only path; the private worker reuses its resident corpus for unchanged storage revision. Both run the same filtering/statistics/layout pipeline for every frame.

`TimelineControls` requests one frame, observes its completed result/range, then schedules a single dwell timeout. Pause, external filters, context/export, hidden documents, errors and unmount stop scheduling. In-flight analysis may complete once after pause. Context selection snapshots the selected term, its bounded contexts and committed period together, so an in-flight frame cannot mix new excerpts with old statistics; hiding a word during a pending filter remains available. Private source acquisition blocks playback; it does not get started by timeline actions. No position morphing or permanent frame cache is used, and no runtime dependency or network permission was added.

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
- bundled Japanese IPADIC morphology and an English contextual POS model;
- a small browser-capable ZIP reader such as `fflate`;
- Vitest and Testing Library;
- Playwright;
- ESLint;
- a small DOM-to-image dependency only if it is necessary for reliable export.

Do not introduce a backend, remote API, analytics SDK, remote font, CDN script, or runtime package loading. Dictionary fetches load only fixed assets shipped in the same static deployment; source text is never a request parameter or body. The separately authorized private build's existing local store is governed by `docs/PRIVATE_LOCAL.md`, not the ordinary Web retention policy.

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
    morphology.ts
    englishMorphology.ts
    lexical.ts
    nounPhrases.ts
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
3. when code exclusion is enabled, remove fenced code and inline expressions, complete delimited TeX math, TeX command markers and recognized shell-prompt lines; preserve only the bounded single-identifier inline exception below;
4. remove blockquote lines when enabled;
5. remove URLs, email-like strings, long hashes, and obvious file paths;
6. remove Markdown link destinations while retaining safe anchor text;
7. collapse horizontal whitespace while preserving newline boundaries at removed source material;
8. cap per-message analysis length and emit a safe warning when capped;
9. reject zero-width and control-character noise.

URL, email and known bounded provider-citation-control removal is always enabled. Removed material leaves a hard newline boundary so English words on either side cannot form a manufactured phrase. Markdown link labels remain available, surrounded by hard boundaries. Do not claim perfect recognition of pasted articles, quotations, mathematical notation, shell commands or all path formats; unmatched delimiters may remain.

An inline-code span may retain one ASCII identifier of at most 64 UTF-16 units: letter/underscore-led identifier components optionally separated by dots, or the single-letter C++/C#-style form. Examples include React, useEffect and Node.js. It cannot contain spaces, function-call/expression punctuation, paths or URL syntax. The retained identifier is surrounded by newlines, never concatenated with neighboring prose. This preserves source names as possible evidence without treating an entire code expression as a noun phrase; downstream mandatory redaction and hidden-term policy still applies.

## 8. Morphological tokenization and filtering

### 8.1 Runtime contract and bounds

```ts
await initializeMorphology(); // once per worker, shared concurrent initialization
const parts = segmentMorphology(cleanedText); // all Japanese POS and exact source spans
const english = tagEnglishSpans(cleanedText); // English Penn POS and exact source spans
const { words, limitedSpanCount } = extractLexicalTokensDetailed(cleanedText, hiddenTerms);
```

`MorphToken` retains `surface`, zero-based UTF-16 `index` / `end`, POS details, `known` and optional `limited`; its basic form is informational and never replaces the source surface in counts. Source-slice equality is verified instead of trusting kuromoji's code-point-based positions. Latin canonical forms are lowercased, and the most common observed variant supplies the display form.

Japanese processing is capped at 100,000 UTF-16 units per cleaned message. Its Viterbi lattice sees at most 256 units at a time, with 64 units of look-ahead; only complete token boundaries are committed before the next window. Sentence punctuation and surrogate characters are explicit boundaries. The BMP-only dictionary does not claim supplementary-plane character recognition. An indivisible pathological run becomes a `limited:true` non-lexical span, not invented chopped words; the pipeline reports its count. English context is capped at 128 tokens and individual accepted tagger inputs at 256 units. Japanese, emoji, newline and removed-text gaps delimit English context. English contractions are source splits, not expansions or generated lemmas.

The Japanese core is imported directly with `DynamicDictionaries` / `Tokenizer`, bypassing upstream Node/XHR loaders. Gzip inputs have fixed expected expanded lengths and a 6,000,000-byte compressed-file ceiling, and are loaded sequentially. The English model is statically bundled. Dictionary failure is explicit and cannot silently restore heuristic-only topic output. Ordinary Web workers never persist messages or linguistic caches.

### 8.2 Common ledger and presentation eligibility

`lexical.ts` combines the Japanese and English spans; an English UNKNOWN noun label from IPADIC is not treated as grammatical evidence. It removes particles, auxiliaries, interjections, punctuation, pure numbers, non-independent/pronominal forms, unsafe symbol runs, exact acknowledgments and hidden spans. Unknown all-hiragana blobs are conservative exclusions, not a ban on dictionary-recognized hiragana content words. Very short Latin noise is excluded; bounded acronym/programming-identifier forms are preserved by explicit orthographic rules. Model errors and domain-specific identifiers remain limitations.

Accepted nouns, verbs, adjectives and noun-connecting prefixes can enter the common measurement ledger. Standalone display excludes prefix/suffix atoms and explicit stopwords; topic eligibility additionally requires eligible nominal usage, excluding standalone adjectives, procedural forms and one-character Japanese-script atoms. Japanese procedural nouns may remain measurement atoms so real compounds such as 説明変数 are not destroyed. Prefixes/suffixes and English adjectives can modify grammatical noun phrases without becoming isolated topic labels. The 50% distinct-message topic threshold is applied at aggregation, not by deleting a surviving word's non-nominal measurements.

IPADIC labels Japanese adjectival stems as nouns, so `形容動詞語幹` receives a bounded local context check. A following copula with basic form だ/です, に/な/という, or と＋いう/言う marks that occurrence adjectival rather than standalone-topic nominal evidence. Nominal contexts such as 自由が / 不安を and literal noun compounds remain possible. This is an explicit grammatical approximation, not sentiment inference or a blanket exclusion of words expressing feelings or evaluation.

Hidden matches must align with actual span boundaries; matching joins are bounded to 64 UTF-16 units. No substring rule removes `OKR` because `OK` is hidden. Original text and intervening gaps remain intact: punctuation, removed grammar and hidden spans cannot be bridged into a phrase. A response-only message still contributes to role message totals, dates and conversation counts but has zero accepted content tokens. An all-noise or all-ineligible input produces an explained empty chart, never filler.

## 9. Grammatical noun phrases

`nounPhrases.ts` replaces unrestricted bigram/trigram association discovery in production. Words-only mode bypasses phrase candidates; the atomic ledger is unchanged.

A candidate must:

- contain 2–6 Japanese/mixed noun atoms or 2–4 English noun/modifier atoms, spanning at most 40 UTF-16 units;
- have only grammatical noun/modifier components, never start with a suffix or end with a prefix/adjective;
- contain an eligible topic atom, or satisfy the explicit productive Japanese nominal-suffix rule (for example 回答率), rather than qualify merely because it contains several generic words;
- be literally adjacent for Japanese compounds; English permits horizontal spaces/tabs but not newlines;
- never cross punctuation, Japanese whitespace lists, removed verbs/grammar, code or hidden spans;
- occur in at least two distinct source messages, including within one focused conversation;
- retain the exact source surface and every counted occurrence of a returned phrase.

No NPMI threshold, cross-conversation requirement or three-message one-thread exception remains. Component statistics are retained, and only the later actual-position containment stage decides whether a compound represents a component in the display. This is grammar-constrained surface extraction, not entity recognition or semantic topic generation.

Large-corpus extraction uses four bounded passes over all prepared messages, not a first-token prefix or an all-phrases-off fallback:

1. Estimate distinct-message support with a fixed 6 MiB, three-row Count-Min sketch. A per-message set prevents repeated text inside one answer from becoming extra message support.
2. Admit at most 100,000 candidate keys through a deterministic bounded heap ordered by estimated support, longer canonical surface, then canonical lexical order. Estimates below two do not enter; hash collisions can influence admission only.
3. Recount exact full-corpus message DF and occurrence totals for admitted keys; remove actual single-message families. Select whole phrase families into a 500,000-position budget, ordered by exact DF, larger atom count, longer surface, fewer total positions and canonical order. Skip an over-budget family rather than taking only its prefix occurrences.
4. Replay every position of retained families. All returned DF, occurrence counts, spans and subsequent role measurements are exact over the complete prepared corpus. Omitted candidate vocabulary is a selection limitation, not a partial frequency estimate.

The extraction metadata records candidate-capacity status, examined/supported/retained family counts, omitted supported families and retained positions. `limited` means one or more complete families may have been excluded; it does not mean phrases are globally disabled. Candidate-capacity saturation cannot supply an exact count of every unseen candidate family. The existing safe warning recommends a narrower period/provider when budget exclusions occur.

## 10. Statistics

Use message-document frequency and empirical role-specific message occurrence rates as the primary measures. These describe the proportion of messages containing a term; they do **not** correct message length or establish statistical equivalence.

For term `w` and role `r`:

```text
df_r(w)   = number of messages by role r containing w
m_r       = total analyzed messages by role r
rate_r(w) = df_r(w) / m_r
```

Role bias:

```text
normalizedBias(w) = (rate_user(w) - rate_assistant(w)) /
                    (rate_user(w) + rate_assistant(w))
```

Interpretation:

- near +1: user-dominant;
- `abs(bias) < 0.18`: shared only if `df_user > 0` AND `df_assistant > 0`;
- near -1: assistant-dominant.

No pseudocount may turn an unobserved term into shared vocabulary. With both roles present, a term seen only in one role has bias +1 or -1. If either role has no messages, comparison is `insufficient`, rendered neutrally with numerical X bias 0 solely for placement; its absent-role rate is displayed as unavailable and it is excluded from shared insights. Rates are descriptive, not a confidence test. `10/100` user versus `0/4` assistant must be user-dominant, never shared.

Tooltip and existing context drawer show role message DF/total/rate, occurrence counts, content-token totals and occurrences per 1,000 content tokens, plus unique conversation coverage. Both token-frequency numerator and denominator use the same cleaned, NFKC-normalized, grammar/noise/hidden-word-filtered `AnalysisDocument.words` stream. A word occurrence is one accepted atom; a phrase occurrence is one accepted grammatical window of those atoms (up to six Japanese or four English). Count every occurrence of a returned candidate, not only the first in a message. Prefix/suffix or non-topic atoms retained in this ledger remain denominator tokens even when not independently displayed. Phrase windows are **not** added to the denominator. A zero token denominator is unavailable (`null`), not zero frequency. This is not a model/API billing tokenizer.

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
3. rank topic mode by its documented selection-only score, broad mode by importance;
4. preserve a useful mix of user-biased, shared, and AI-biased terms;
5. use actual occurrence-span containment to prefer representative compounds;
6. select the requested top N.

For 80 terms, a useful initial quota is up to 30 user-side, 20 shared, and 30 AI-side. Redistribute unused capacity.

Display-only compound representation: if at least two occurrences and at least 80% of a short term's occurrences are inside the actual spans of the **same** eligible longer phrase, prefer the longer phrase. A sweep over per-document `[index,end)` spans establishes coverage; substring equality or mere co-occurrence in a message is insufficient. Exactly 80% qualifies; 70% does not. Keep component aggregate statistics, Echo and adoption input unchanged. Prioritize non-redundant representatives, apply side quotas, then fill available slots with unrepresented components if their representative was not selected. Do not impose the former 35% phrase cap or string-length near-duplicate heuristic. Show the number of represented candidate terms separately from physical layout omissions.

The grammatical phrase extractor's bounded vocabulary discovery must not publish partially counted frequencies. Any returned phrase is counted over the full prepared corpus; candidate/position-limit omissions must be disclosed separately. Words and their denominators remain complete within the documented cleaned-text cap. The earlier first-5,000-token discovery / 20,000-candidate NPMI mechanism is not the production path.

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
5. constrain centers to `xTarget ± 0.055 * canvasWidth`; additionally constrain the entire padded box to its own half for user/assistant labels, with a 4-unit center clearance;
6. reject collisions and positions outside padded bounds;
7. exhaust all free Y intervals at a candidate X before trying another X; bounded whole-cloud anchor retries may use offsets 0 / -0.9 / +0.9 of that same allowed drift, never a free canvas search;
8. retry one global font scale (1.0 to 0.2 by 0.1, common 13-unit floor), retaining the most terms and preferring larger-scale earlier retries on ties; report unplaceable terms in the always-visible caption;
9. never rotate terms by default;
10. cache by stable data and setting signatures where safe.

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

For viewports up to 620 px, derive a deterministic SVG overview of at most 24 terms from the already-filtered laid-out term set. Allocate equal provisional quotas to user, shared, and assistant labels, fill unused quota by global importance, and keep the full requested layout unchanged for the labelled detail mode. Reuse the constrained layout engine at width 390, inset 50, padding 8, a 13–22-unit font range, and at least 44-unit collision height. Observe the actual canvas height so persistent captions do not shrink the overview into microtext. The detail mode starts centered in a horizontally pannable SVG. Show physical omission counts and overview-subset exclusion counts separately. No fixed Y-slot fallback or overlapping slot reuse is allowed.

Axis labels and compact reading notes occupy normal flex flow outside the SVG canvas. Always show the source (synthetic demo versus imported data), providers, observed date period or missing-date label, conversation count, X/size/Y meanings, message-rate definition and quota caveat. Shared does not mean agreement, and displayed side proportions do not represent corpus proportions. SVG contracts unusually wide local-font text into its un-clamped padded collision box; it never stretches a narrow word. Preserve hover breathing room.

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

The ordinary Web build must never persist raw conversations. The separately authorized private extension keeps its existing account-scoped local history/progress store under `docs/PRIVATE_LOCAL.md`; morphology adds no new durable text storage. Permitted ordinary preferences include:

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
- reuse layout coordinates and transform fonts by at most the smaller coordinate-axis scale (currently 1.23, versus X 1.76); cap drawn width to the corresponding unpadded glyph allowance so PNG cannot invalidate collision boxes;
- include the same source/period/count, coordinate/size meanings, shared definition, quota caveat and layout omission count as the screen;
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
