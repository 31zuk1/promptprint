# Promptprint architecture

> Status: local morphological topic-extraction redesign, reconciled on 2026-09-09. Product and technical specifications remain the behavioral source of truth; known implementation tradeoffs are called out explicitly below.

## Goals

Optional metric-based 3D is a presentation-only branch after the existing layout. `spatial.ts` owns exact metrics and fixed-domain orthographic projection; `spatialScene.ts` owns bounded labels, grid/ticks and depth order. `SpatialCloud` and `exportSpatial.ts` share this scene without modifying worker statistics. Both ordinary and isolated-private apps share mode/camera controls, dates, context snapshots and aggregate-only export. There is no added production dependency, WebGL context, runtime request, source-acquisition route or persistence. See the technical specification for axis formulas and camera bounds; the original Mirror Cloud remains the default.

Promptprint turns local ChatGPT and experimental Claude exports into a role-aware lexical visualization without sending conversation text outside the browser. The architecture prioritizes:

- a visible end-to-end demo and real import path;
- strict privacy boundaries;
- defensive handling of untrusted archives and JSON;
- deterministic, explainable statistics and layout;
- a responsive main thread;
- small, testable pure-function modules.

## Runtime topology

```text
Browser main thread
  Landing / file picker / reducer
       |
       | serializable requests and progress
       v
Analysis Web Worker
  ZIP inventory -> provider detection -> adapters
       -> normalized conversations
       -> bundled Japanese/English POS initialization
       -> cleaning -> source-span lexical ledger -> grammatical noun phrases
       -> statistics -> insights -> layout inputs/results
       |
       | normalized corpus, aggregates, and bounded contexts
       v
Browser main thread
  Summary + filters + Mirror Cloud + insights + local context
       |
       v
  Dedicated local canvas drawing -> PNG Blob -> local download
```

The ordinary deployed artifact is a static Vite bundle under `dist/`, with its fixed dictionary assets. There is no application server or database. The separately authorized private build uses its existing extension-origin IndexedDB and read-only acquisition path; see `docs/PRIVATE_LOCAL.md`. Morphological analysis is shared without adding acquisition permissions or changing either build's retention boundary.

## Privacy boundary

Raw files and message text may exist only in:

- the browser's file objects and array buffers;
- worker memory during import and analysis;
- volatile application memory needed for filter reanalysis and bounded local context excerpts.

They must not be written to:

- network requests;
- localStorage, IndexedDB, cookies, or service-worker caches;
- analytics or crash-reporting tools;
- exported PNG content;
- user-facing diagnostics.

The ordinary Web implementation does not persist UI preferences or application data. Its fixed same-origin dictionary files contain only shipped public language resources; no conversation value is placed in their requests or cache keys. The clear-data operation increments the active-operation generation, terminates the current worker (releasing its dictionary and volatile lexical cache), aborts an in-progress PNG operation, discards normalized messages and indexes, revokes tracked object URLs, resets filters, and returns to the empty state. The private build's existing explicit local-save/clear controls remain separate.

Playwright guards tested demo and import flows so they can contact only the exact same-origin local test server. It also checks local/session storage, cookies, IndexedDB databases, Cache API entries, service-worker registrations, and the strings drawn into exported Canvas output. Storage is asserted after both the synthetic demo and an import containing private sentinels. These tests demonstrate the covered flows; they are not a proof about browser extensions or the host operating system.

## Data model

Provider adapters produce a shared model:

```ts
type Provider = "chatgpt" | "claude" | "demo";
type MessageRole = "user" | "assistant";

interface NormalizedConversation {
  id: string;
  provider: Provider;
  title: string;
  createdAt: number | null;
  updatedAt: number | null;
  messages: NormalizedMessage[];
  sourceFile?: string;
}

interface NormalizedMessage {
  id: string;
  conversationId: string;
  provider: Provider;
  role: MessageRole;
  createdAt: number | null;
  order: number;
  originalText: string;
  analysisText: string;
}
```

`originalText` remains untouched for local context. Adapters also populate `analysisText` as a normalization-layer text field; in the current implementation it initially matches the extracted original text. Each analysis run derives a separate ephemeral `cleanedText` according to the active code/quote settings, and only that cleaned value is tokenized. This prevents filter changes from corrupting source context.

Every imported boundary starts from `unknown` and uses explicit guards. Diagnostics carry safe metadata and counts, not raw source fragments.

Internal conversation and message IDs keep a short readable safe prefix but derive identity from a framed deterministic 64-bit FNV-1a hash plus explicit file, ZIP-entry, conversation, and message ordinals. Source identity is separate from the truncated `sourceFile` display label. Raw ZIP paths are hashed before they are discarded, so two long paths or provider IDs with the same visible prefix cannot collapse document-frequency, conversation-coverage, Echo, or ordering keys. Hash work over any one untrusted string is bounded to its full length marker plus the first and last 2,048 UTF-16 code units. This is a deterministic identity mechanism, not a cryptographic secrecy claim.

## Source adapters

### Synthetic demo

The demo is represented as source conversations rather than precomputed cloud terms. It enters through the same normalization, cleaning, statistics, and layout pipeline as imported data. This makes the demo a useful integration fixture and prevents a polished mock from diverging from production behavior.

### ChatGPT

The adapter supports:

- top-level conversation arrays;
- `{ conversations: [...] }`;
- graph conversations using `mapping` and `current_node`;
- direct `messages` arrays;
- multiple likely JSON files inside one ZIP.

For graph exports it follows the valid current node's parent chain to the root. If the current node is invalid, it deterministically selects the most recent usable leaf path and then the longest usable path, recording a warning. It never includes every abandoned branch by default.

Only user and assistant textual content is normalized. System/developer/context messages, tools, outputs, empty content, and attachment-only payloads are skipped.

### Claude

The experimental Claude adapter recognizes a bounded set of conversation, message, role, and content variants. It maps human/user and assistant/ai/claude role names into the shared model. Bounded recursive text extraction can read common text blocks without walking arbitrary private structures indefinitely.

Unsupported structures yield only root type, an allowlisted subset of recognized structural keys, bounded counts, and recovery guidance. At most 64 keys are inspected and 12 recognized names are rendered; arbitrary unknown key names and every value remain hidden. The UI and limitations documentation label this adapter experimental.

### ZIP handling

ZIP files are inventoried in memory with `fflate.unzipSync`. The importer ignores directories, hidden metadata, and non-JSON payloads. If it finds conversation-like JSON names—including aggregate `conversations.json`, `chats.json`, numbered files, and common conversation/chat variants—it parses all of those candidates and records the other JSON entries as deliberately skipped. If none of the JSON filenames look conversation-like, it safely tries the bounded JSON set. The implemented limits are:

| Boundary | Limit |
| --- | ---: |
| selected files | 32 |
| selected-file aggregate bytes | 500 MB |
| one ZIP input | 500 MB; warning above 200 MB |
| all ZIP directory entries | 4,096 |
| JSON entries considered in one ZIP | 256 |
| one inflated ZIP JSON entry | 64 MB |
| aggregate inflated ZIP JSON bytes | 200 MB |
| one raw JSON input | 200 MB |
| normalized output across one import selection | 20,000 conversations / 200,000 messages |
| provider conversation candidates | 20,000 |
| messages in one conversation | 100,000 |
| ChatGPT graph nodes | 200,000 |
| ChatGPT fallback leaf candidates | 5,000 |
| ChatGPT fallback traversal steps | 1,000,000 |
| nested text extraction | depth 6, 4,096 visited items, 256 text blocks, 1,000,000 characters per message |
| accepted timestamp range | Unix epoch through 3000-01-01 UTC; other values become unknown |

The limits apply before or during normalization and return safe Japanese diagnostics when exceeded. One mutable normalized-output budget is shared deterministically across selected JSON files and selected ZIP entries; once exhausted, later sources are not parsed and the diagnostic reports omitted candidate/source counts. ChatGPT fallback considers at most the first 5,000 leaf candidates and explicitly reports any omitted leaves. ZIP decompression is synchronous inside the worker and is not streaming; the browser can therefore require substantially more memory than the compressed input size.

## Analysis pipeline

### Cleaning

The pure cleaning sequence:

1. NFKC Unicode normalization;
2. line-ending normalization;
3. optional fenced code / inline-expression, complete delimited math, TeX-marker and recognized shell-prompt removal, with a bounded single-identifier inline exception;
4. optional blockquote-line removal;
5. mandatory URL, email-like string, long-hash, and obvious-path removal;
6. Markdown destination removal while keeping safe anchor text;
7. horizontal-whitespace collapse with hard newlines retained around removed source material;
8. per-message length cap;
9. zero-width and control-noise rejection.

Cleaning never mutates `originalText`. Mandatory URL/email/path/hash and known bounded citation-control removal leaves newline boundaries; otherwise English nouns separated by a removed URL or code span could become an invented phrase. Unmatched notation is not guessed away, and Markdown link labels remain available between hard boundaries. Inline code preserves only one ASCII identifier of at most 64 units (including dotted names or C++/C#-style forms), such as React / useEffect / Node.js, surrounded by newlines. Expressions, paths and arbitrary code snippets do not get this exception. These are bounded source-notation heuristics, not complete quotation/code detection.

### Local morphology and the shared lexical ledger

`morphology.ts` loads the pinned kuromoji/IPADIC core and dictionary in an analysis worker. It does not use the upstream Node or XHR loaders. `englishMorphology.ts` applies the bundled wink contextual English POS model; IPADIC's UNKNOWN noun label is not grammatical evidence for English. Both return observed forms and verified zero-based UTF-16 spans. Lemmas are available from upstream models but are never substituted into the measurement ledger or context query. Latin canonical forms are lowercased/NFKC-normalized, while the most common observed variant remains the display form.

`lexical.ts` combines those spans, removes grammar/noise/hidden spans, and prepares one ordered `AnalysisDocument.words` ledger for both `topics` and `all` modes. Nouns, eligible verb/adjective forms and compound-building prefix/suffix atoms may remain measurement atoms; `displayEligible` and `topicEligible` carry separate presentation evidence. English adjectives can modify a noun phrase without becoming standalone topic nouns. Japanese non-independent/pronominal/numeric forms, unknown all-hiragana blobs, acknowledgments and punctuation are conservative exclusions. Recognized hiragana content nouns are not globally banned. Bounded orthographic acronym/identifier handling preserves appropriate technical units without claiming perfect entity recognition.

Japanese `形容動詞語幹` is not automatically a standalone topic merely because IPADIC calls it a noun. Bounded copular/adverbial/attributive contexts (だ/です, に/な, という) mark that occurrence adjectival, while nominal uses such as 自由が / 不安を and real compounds may retain nominal evidence. This avoids treating every evaluative predicate as a subject without globally banning the same words as legitimate topics. Single-character Japanese atoms are not standalone topic labels but can still participate in compounds.

Japanese lattice windows are at most 256 UTF-16 units with 64 units of look-ahead, committing complete token boundaries. Sentence punctuation and surrogate characters delimit the BMP dictionary; long ordinary Japanese still covers the complete source. Indivisible pathological runs are marked non-lexical `limited` spans and counted in a safe warning, not chopped into fabricated words. English tagging sees at most 128 tokens per context window and 256 units per individual tagger input. Cleaned input remains capped at 100,000 units per message. Position mismatch or dictionary failure is explicit, not a fallback to the rejected heuristic-only foundation.

### Grammatical noun phrases

`nounPhrases.ts` selects actual contiguous noun sequences, up to six Japanese/mixed atoms or four English atoms and 40 UTF-16 units. English adjective modifiers are allowed only before a final noun; suffix-first and prefix-final fragments are disallowed. A phrase needs an eligible atom or the explicit productive Japanese nominal-derivation rule, and must appear in two distinct messages, even in one focused thread. Japanese whitespace lists are not compounds. Punctuation, newline, removed verbs/grammar and hidden spans remain boundaries. The former arbitrary 2/3-gram NPMI path and cross-conversation/three-message exception are no longer used by production analysis.

The four-pass extractor first sketches distinct-message support in a fixed 6 MiB Count-Min sketch, then admits up to 100,000 strong candidate keys through a deterministic heap. It exactly recounts DF and all occurrences of those admitted keys over the full corpus, excludes true singletons, selects complete phrase families into a 500,000-position budget, and replays every retained position. Exact-DF ties prefer larger atom counts/longer phrases, then lower position cost and canonical order. A family that does not fit is omitted entirely; it never receives a truncated frequency. Approximation and hash collisions affect candidate admission only, not any returned measurement.

Candidate-capacity status and examined/supported/retained/omitted-supported family counts are available in extraction metadata; a safe warning discloses budget exclusions. Saturation is not an exact count of all unseen vocabulary. Crucially, a large singleton tail no longer disables every phrase. Words-only mode bypasses phrase generation; atoms, message denominators and role token totals are unchanged. Context generation examines at most the first 200,000 normalized source characters, stores at most 20 excerpts per selected term, and targets roughly 190 characters per excerpt.

### Statistics

Message occurrence rates describe the proportion of a role's messages containing the term. They do not correct message length:

```text
df_r(w)   = messages by role r containing term w
m_r       = analyzed messages by role r
rate_r(w) = df_r(w) / m_r
```

Bias:

```text
normalizedBias = (rate_user - rate_assistant) / (rate_user + rate_assistant)
```

With both role denominators positive, user is bias >= .18, assistant <= -.18, shared requires positive DF in **both** roles and abs(bias) < .18. Missing-role comparisons are explicitly insufficient (neutral gray, placement bias 0, no shared insight). No pseudocounts are used. Thus 10/100 versus 0/4 gives bias +1, not shared. Positive bias is user-dominant. Since user terms appear on the left:

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

Raw frequency is a stable tie breaker only. Font size uses logarithmic or quantile mapping.

Top-term selection applies minimum frequency, linguistic/display eligibility, hidden terms, mode-specific ranking, diversity across the three semantic zones, and positional compound representation before the requested count. The topic-ranking score below never replaces importance as the size metric.

`findContainmentRepresentatives` sweeps actual per-document token/phrase intervals, counting each short occurrence once per longer term. At least two and >=80% must lie inside the same longer phrase. Equal spans, unrelated positions and substring matches alone do not qualify. Selection prefers non-redundant representatives, applies side quotas (37.5% / 25% / remainder), redistributes unused slots and may restore components when their representative was not chosen. Aggregate `TermStats`, analyzed vocabulary count, Echo and adoption inputs are unchanged. There is no phrase-count cap or substring-only deduplication. The caption distinguishes representative candidate counts, layout omissions and mobile subset exclusions.

Role token rates use `1000 * occurrenceCount / contentTokenTotal`. The denominator is the complete `AnalysisDocument.words` stream after cleaning, normalization, grammar/noise and hidden-word filtering; a word numerator counts matches in exactly that stream. A phrase numerator counts accepted grammatical windows in that same stream, including every repeat of a returned phrase; phrases do not augment the denominator. Non-topic and prefix/suffix atoms retained in the common ledger remain denominator tokens even when not individually displayed. Zero denominators display unavailable. This is a local content-token definition, not model tokenization. Filter changes, including hidden words, recompute both numerator and denominator consistently. Role DF keys frame conversation ID and message ID to avoid cross-conversation ID reuse collisions.

### Echo rate

Adjacent user-to-assistant turns are eligible when the user side has enough salient terms.

```text
idf(w) = ln((N + 1) / (globalDf(w) + 1)) + 1

pairEcho =
  sum(idf(w), w in userSet intersect assistantSet)
  / sum(idf(w), w in userSet)
```

Pair aggregation is weighted by the square root of salient user-token count. The result includes eligible pair count and confidence and is labeled as lexical reuse, not quality.

### AI-first candidates

Messages are ordered by timestamp with stable import order as fallback. A term qualifies only when it first appears on the assistant side and is later reused by the user in multiple messages, preferably across multiple conversations, while clearing ordinary frequency and noise thresholds.

The result is temporal association only. It is hidden when evidence is insufficient.

## Worker and cancellation

The main thread sends either transferable file `ArrayBuffer` payloads or normalized demo conversations together with analysis settings. Every request and response has a monotonically increasing `requestId`. Both workers first report `端末内の品詞辞書を準備中` and await the deduplicated dictionary initialization. They reject stale requests after asynchronous boundaries, including dictionary and private-store loading. Subsequent stages report safe diagnostics, normalized conversations, summary, statistics, insights, bounded contexts, layout, and recoverable failures. The main thread accepts only the newest request ID, so an earlier queued result cannot overwrite newer settings or prematurely re-enable export.

After import, normalized conversations are retained in volatile React state. A filter change sends that normalized corpus back to the existing worker and reruns cleaning/statistics/layout, so it does not reread or reparse the selected files. This simple PoC design does structured-clone the normalized strings for each filter update; retaining the corpus behind worker-side identifiers is a future memory/performance improvement.

The private worker already retains its stored corpus by namespace/revision. A worker-local WeakMap may reuse cleaned lexical data for the identical message object, source text and cleaning/hidden signature, under an 8,000,000-character admission ceiling. Dates, display mode and phrase choice do not alter those atoms. This is volatile performance reuse, not durable storage or a measurement shortcut; new structured-cloned message objects may not hit the cache, and terminating the worker releases it.

Cancellation is implemented by terminating the dedicated worker rather than by cooperative checks inside the synchronous analysis functions. File `arrayBuffer()` reads cannot be aborted, so an operation-generation guard ignores their late completion. Worker callbacks verify worker identity, operation generation, and analysis request ID. Clear-data invalidates both generations, terminates the worker, aborts pending PNG work, revokes tracked object URLs, and clears volatile state. A new worker is created lazily for the next operation.

## Mirror Cloud layout

The cloud uses interactive SVG, approximately 1100 × 620 logical units:

1. map robust importance to font size;
2. estimate a padded text box deterministically from script-aware character widths;
3. derive target x from bias;
4. derive target y from a stable hash of term and filter signature;
5. sort largest-first with stable ties;
6. intersect `targetX ± 5.5% of canvas width` with canvas bounds and the full-box semantic half (4-unit center clearance), then exhaust free Y intervals before changing X;
7. reject padded collisions and out-of-bounds positions;
8. retry common font scales 1.0–0.2 in steps of .1 with a shared 13-unit floor, and bounded whole-cloud column anchors (0 / -.9 / +.9 of the allowed X drift); retain the most words, prefer larger earlier retries on ties, and report omissions in the persistent caption.

There is no default rotation. The same data and settings must generate the same coordinates and colors.

No fallback may relax X limits or move a dominant word to the opposite half. Width estimates are never clamped to canvas width; an overlong label is scaled with the cloud or omitted. SVG measures the actual local-font text and contracts it only when wider than the reserved glyph allowance. Mobile overview reuses the same algorithm with width 390, inset 50, padding 8, minimum collision height 44 and observed canvas height; at most 24 quota-selected terms are attempted. Full desktop coordinates remain unchanged in horizontally pannable detail mode.

SVG terms are focusable controls. Hover/focus shows statistics; click/Enter opens context; Escape closes and restores focus. Position, color, edge labels, and accessible names all communicate side meaning.

## State and filtering

A reducer or similarly small state container tracks:

- lifecycle: empty, importing, analyzing, ready, recoverable error;
- active worker request and cancellation;
- volatile normalized summary and contexts;
- provider/time/count/type/exclusion settings;
- hidden terms;
- active tooltip and context term;
- diagnostics.

All analysis-affecting controls use a stable settings signature. Display-only changes may reuse analysis where safe, but observable output must remain equivalent to the canonical pipeline.

## PNG export

The implementation draws a dedicated 2,200 × 1,340 share card directly onto a local Canvas. It does not screenshot or serialize the dashboard DOM. The share model contains only:

- Promptprint branding;
- laid-out aggregate terms;
- semantic legend;
- counts and date range;
- privacy note.

It excludes original messages, excerpts, conversation titles, emails, diagnostics, tooltips, drawers, buttons, and hidden terms. The export button is disabled while analysis or another export is active. An `AbortSignal` prevents a delayed Canvas callback from starting a download after clear-data. The object URL is normally revoked one second after download and is also tracked for immediate revocation on clear/unmount. The filename is `promptprint-YYYY-MM-DD.png`.

PNG preserves screen collision geometry: X positions scale 1.76, Y positions scale 1.23, font size scales by the smaller factor (1.23, not the former 1.75), and `fillText` receives the corresponding unpadded width cap. Source/period/conversation count, meanings of X/size/Y, message-rate/shared definition, quota caveat and physical omission count remain visible. Browser regression checks measure actual Canvas ink extents and SVG glyph boxes for one-sided 40/80/120 fixtures.

## Dependencies

Current declared runtime dependencies:

| Dependency | Purpose | Privacy/runtime note |
| --- | --- | --- |
| React / React DOM | UI composition and rendering | bundled locally |
| fflate | browser-side ZIP inventory and decompression | bundled locally; no network service |
| kuromoji 0.1.2 | Japanese morphological lattice and packaged IPADIC dictionary | direct browser-safe core imports; 12 fixed same-origin/extension assets; no text transmission |
| wink-pos-tagger 2.2.2 | English contextual POS, avoiding Japanese UNKNOWN-as-noun errors | model and transitive lexicons bundled in Worker JavaScript; no runtime model service |

Current development dependencies provide Vite, TypeScript, ESLint, Vitest, Testing Library, jsdom, and Playwright. Keep dependencies pinned through `pnpm-lock.yaml`.

The linguistic dependencies deliberately trade size for grammatical evidence that the previous wordlike/stopword-only design lacked. IPADIC assets total 17,791,956 compressed bytes and 100,260,388 expanded bytes, before JavaScript indexes, message caches and temporary lattice work. The integrated analysis workers are approximately 2.1 MB of JavaScript, largely the English model; actual build hashes/sizes belong in the ExecPlan. Initialization is per worker, sequentially loading fixed-size gzip outputs. The libraries/dictionaries are older resources, not automatically updated contemporary-language models; pinned lockfiles and behavioral regression fixtures are essential. `morphology-assets.mjs` emits Apache/IPADIC notices and applicable MIT licenses alongside both builds. Primary upstream references: [kuromoji.js](https://github.com/takuyaa/kuromoji.js), [wink-pos-tagger](https://github.com/winkjs/wink-pos-tagger).

## Failure behavior

Errors are values in the application lifecycle rather than uncaught exceptions. A recoverable failure:

- stops or invalidates current work;
- keeps or returns a usable landing surface;
- states the failed stage in Japanese;
- shows only safe diagnostic metadata;
- suggests supported files or a size/schema remedy;
- never claims partially skipped input was completely parsed.

Worker errors, parsing errors, file-reader failures, ZIP failures, canvas export failures, and stale responses must all follow this path.

## Validation architecture

Pure modules use Vitest with small hand-checkable fixtures. Current unit coverage includes ChatGPT active-branch and bounded fallback behavior, ChatGPT/Claude content extraction, collision-resistant normalized identities and downstream counts, safe shape diagnostics and timestamp bounds, cleaning, tokenization, phrase selection, bias/importance, Echo rate, AI-first candidates, deterministic collision/bounds layout, ZIP errors/limits, aggregate normalized-output limits, long-path ZIP classification, and demo expectations.

Current Playwright coverage includes:

- synthetic demo and required term visibility;
- Enter/click context opening, highlighting, focus trap, Escape, and focus restoration;
- hidden-term recomputation and exclusion from Canvas output;
- display-count filtering and a non-empty named PNG download;
- browser storage, same-origin request, console, and page-error guards on covered flows;
- malformed JSON and safe unsupported-Claude diagnostics;
- a successful ChatGPT-shaped JSON import mixed with an unsupported file, honest skip reporting, and export-string privacy checks;
- cancellation during delayed file reading;
- clearing during delayed PNG encoding;
- latest-request protection while an older 20,000-message filter result completes;
- a 1440 × 1000 screenshot and an operable 390 × 844 mobile flow.

Empty-ZIP, ZIP-size, content-extraction, and active-branch sentinel cases are unit-tested rather than duplicated in Playwright. Tooltip visibility and its role statistics have a dedicated keyboard-focus browser assertion.

The canonical visual artifact is `artifacts/promptprint-demo.png`.

## Topic evidence and display-only ranking (redesign, 2026-09-09)

`statistics.ts` aggregates occurrence-level grammatical evidence separately from its unchanged quantitative metrics. A candidate is topic-eligible when `nounMessageCount / messageDf >= 0.5`; a message counts once if it contains any eligible nominal occurrence. All accepted observations still contribute to DF, role rates and token frequency. Exact procedural-word guards suppress standalone scaffolding without removing useful compound atoms. Prefix/suffix and English adjective atoms are phrase building blocks, not isolated topic labels.

Production topic ranking is `ln(1 + D) × (1 + ln((C + 1)/(c + 1))) × D/(D + 2)`, where `D` is candidate message DF, `C` the selected conversation count and `c` candidate conversation coverage. Repetition support and inverse conversation coverage replace the previous maximum-35% bonus. The floor retains all-conversation themes; it does not establish semantic relevance or external-population distinctiveness. Broad mode still orders by importance. `vocabulary.ts` consumes this evidence, then quotas and actual-position containment select only eligible terms without filler. Compatibility helpers for handcrafted legacy statistics are not the production scoring path.

The same completed result metadata drives ordinary/private, 2D/3D, timeline, insights, provider summaries and Canvas export. Size remains `TermStats.importance`; bias/rates/X/Y/Z retain their definitions. Changing only topic/broad mode preserves every surviving term's counts and context, although the selected set can change its relative font scaling. Changing the tokenizer release can change the ledger; no cross-release count invariance is claimed.
