# Promptprint architecture

> Status: implementation snapshot, reconciled on 2026-09-05. Product and technical specifications remain the behavioral source of truth; known implementation tradeoffs are called out explicitly below.

## Goals

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
       -> cleaning -> tokenization -> phrases
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

The deployed artifact is a static Vite bundle under `dist/`. There is no application server or database.

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

The current implementation does not persist UI preferences or application data. The clear-data operation increments the active-operation generation, terminates the current worker, aborts an in-progress PNG operation, discards normalized messages and indexes, revokes tracked object URLs, resets filters, and returns to the empty state.

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
3. optional fenced-code removal;
4. optional blockquote-line removal;
5. mandatory URL, email-like string, long-hash, and obvious-path removal;
6. Markdown destination removal while keeping safe anchor text;
7. whitespace collapse;
8. per-message length cap;
9. zero-width and control-noise rejection.

Cleaning never mutates `originalText`.

### Tokenization and phrases

`Intl.Segmenter` with word granularity provides the baseline for Japanese and English. Latin canonical forms are lowercased while the most common source variant is kept for display. A deterministic local fallback covers browsers without the API.

Noise filters remove punctuation, pure numbers, stopwords, short fragments, generic scaffolding, and symbol-dominated tokens.

Phrase extraction considers adjacent content-token bigrams and trigrams. Candidates must clear document-frequency, cross-conversation, boundary-stopword, and association thresholds. Candidate work is capped. Words-only mode bypasses this stage.

The default phrase bounds are 5,000 input tokens per message, 20,000 distinct candidates, and 500,000 stored candidate occurrences. Cleaned analysis text is capped at 100,000 characters per message. Context generation examines at most the first 200,000 normalized source characters, stores at most 20 excerpts per selected term, and targets roughly 190 characters per excerpt.

### Statistics

Message-document frequency reduces the length advantage of assistant messages:

```text
df_r(w)   = messages by role r containing term w
m_r       = analyzed messages by role r
rate_r(w) = (df_r(w) + 0.5) / (m_r + 1)
```

Bias:

```text
rawBias        = ln(rate_user / rate_assistant)
normalizedBias = tanh(rawBias / 2)
```

Positive bias is user-dominant. Since user terms appear on the left:

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

Top-term selection applies minimum frequency, hidden terms, noise filters, diversity across the three semantic zones, and n-gram deduplication before the requested count.

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

The main thread sends either transferable file `ArrayBuffer` payloads or normalized demo conversations together with analysis settings. Every request and response has a monotonically increasing `requestId`. The worker reports named stages, safe diagnostics, normalized conversations, summary, statistics, insights, bounded contexts, layout, and recoverable failures. The main thread accepts only the newest request ID, so completion of an earlier queued filter analysis cannot overwrite newer settings or prematurely re-enable export.

After import, normalized conversations are retained in volatile React state. A filter change sends that normalized corpus back to the existing worker and reruns cleaning/statistics/layout, so it does not reread or reparse the selected files. This simple PoC design does structured-clone the normalized strings for each filter update; retaining the corpus behind worker-side identifiers is a future memory/performance improvement.

Cancellation is implemented by terminating the dedicated worker rather than by cooperative checks inside the synchronous analysis functions. File `arrayBuffer()` reads cannot be aborted, so an operation-generation guard ignores their late completion. Worker callbacks verify worker identity, operation generation, and analysis request ID. Clear-data invalidates both generations, terminates the worker, aborts pending PNG work, revokes tracked object URLs, and clears volatile state. A new worker is created lazily for the next operation.

## Mirror Cloud layout

The cloud uses interactive SVG, approximately 1100 × 620 logical units:

1. map robust importance to font size;
2. estimate a padded text box deterministically from script-aware character widths;
3. derive target x from bias;
4. derive target y from a stable hash of term and filter signature;
5. sort largest-first with stable ties;
6. search a deterministic spiral or rings near the target;
7. reject padded collisions and out-of-bounds positions;
8. omit or reduce the smallest unplaceable terms and report the count.

There is no default rotation. The same data and settings must generate the same coordinates and colors.

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

## Dependencies

Current declared runtime dependencies:

| Dependency | Purpose | Privacy/runtime note |
| --- | --- | --- |
| React / React DOM | UI composition and rendering | bundled locally |
| fflate | browser-side ZIP inventory and decompression | bundled locally; no network service |

Current development dependencies provide Vite, TypeScript, ESLint, Vitest, Testing Library, jsdom, and Playwright. Keep dependencies pinned through `pnpm-lock.yaml`.

Any added production dependency needs a concise justification here, size/maintenance consideration, and confirmation that it does not load remote assets or transmit data.

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
