# Promptprint limitations

Promptprint is a local, exploratory proof of concept. Its output describes patterns in the imported corpus; it does not diagnose the user, judge answer quality, or establish causal influence.

## Language analysis is heuristic

Japanese and mixed-language segmentation uses browser-local deterministic heuristics, primarily `Intl.Segmenter`. It is not a full morphological analyzer. Compound boundaries, inflections, names, abbreviations, and scripts without whitespace can be split or grouped imperfectly.

Phrase extraction uses document frequency and simple association criteria. A displayed phrase is a recurring surface pattern, not a verified topic or entity.

Stopword and generic-assistant filters are deliberately small and transparent. They can omit a useful term or retain a generic one. The hidden-term feature is the user's final control over visible and exported vocabulary.

Different browser engines or `Intl.Segmenter` implementations may produce small tokenization differences. Within the same supported environment, identical data and settings should remain deterministic.

## Frequency is not importance or truth

Font size reflects a documented importance score derived mainly from message-document frequency and conversation coverage. It does not show:

- factual importance;
- emotional importance;
- correctness;
- agreement;
- topic quality;
- how much time the user spent on a subject.

The scoring reduces, but cannot remove, structural differences between longer assistant replies and shorter user prompts.

## Echo rate is not answer quality

`語彙エコー率` measures weighted lexical reuse from a user message into the immediately following assistant reply. High or low values are neither inherently good nor bad. Paraphrases can lower the score even when the response closely follows the idea; shallow copying can raise it without improving the answer.

Confidence is based on eligible sample size, not semantic validity.

## AI-first is not causation

`AI先行観測語` means only that a term was first found in an assistant message and appeared in later user messages under conservative sequence rules.

It does not prove that:

- AI taught the user the term;
- the user had not encountered it elsewhere;
- the user adopted the same meaning;
- the assistant caused a belief or behavior change.

Missing timestamps and import order weaken temporal evidence. The card is hidden when evidence is insufficient and must always retain its non-causal caveat.

## Quoted and pasted text can affect counts

Fenced code, block quotes, URLs, emails, obvious paths, and common noise are removable. Promptprint cannot reliably detect every pasted article, citation, transcript, quoted paragraph, generated template, or attachment-derived text. Such material can influence counts and apparent role bias.

Original text is shown only as bounded local context and is never included in the share image.

## Export schemas evolve

ChatGPT and Claude may change export filenames and JSON structures without notice.

The ChatGPT adapter targets graph/mapping exports, direct message arrays, and a small set of tolerant text shapes. It selects the current branch where possible and uses a documented deterministic fallback. Unrecognized content blocks or historical formats may be skipped.

Claude support is **experimental**. It recognizes a conservative set of conversation arrays, message arrays, role fields, and text blocks. It has not been validated against every account type or export vintage. Unsupported shapes produce safe diagnostics rather than speculative extraction.

Diagnostics report safe shape metadata and counts. Unsupported objects inspect at most 64 keys and display at most 12 allowlisted structural names; arbitrary unknown key names and all values remain hidden. To investigate a new schema, provide an anonymized structure with private values removed.

## Archive and input limits

ZIP and JSON processing is bounded to avoid decompression bombs, runaway recursion, browser hangs, and memory exhaustion. Very large archives may be rejected or warned about even if their contents are otherwise valid.

The current hard limits are:

| Boundary | Limit |
| --- | ---: |
| files in one selection | 32 |
| selected-file total | 500 MB |
| one ZIP input | 500 MB |
| large-ZIP warning | above 200 MB |
| all entries in one ZIP | 4,096 |
| JSON entries in one ZIP | 256 |
| one inflated ZIP JSON | 64 MB |
| inflated ZIP JSON total | 200 MB |
| one raw JSON | 200 MB |
| normalized output across one import selection | 20,000 conversations / 200,000 messages |
| conversations per provider parse | 20,000 |
| messages per conversation | 100,000 |
| ChatGPT graph | 200,000 nodes |
| ChatGPT fallback | 5,000 leaf candidates and 1,000,000 traversal steps |
| nested content extraction | depth 6, 4,096 visited items, 256 text blocks, 1,000,000 extracted characters per message |
| imported timestamps | Unix epoch through 3000-01-01 UTC; other values are treated as missing |
| cleaned analysis input | 100,000 characters per message |
| phrase generation | first 5,000 tokens per message, 20,000 candidates, 500,000 stored occurrences |
| context lookup | first 200,000 source characters, 20 excerpts per selected term, roughly 190 characters per excerpt |

These are safety ceilings, not recommended dataset sizes. The normalized-output ceiling is shared across selected files and selected ZIP entries; later sources are skipped once either aggregate count is exhausted. ZIP decompression is synchronous inside a Web Worker rather than streaming, and the 200 MB inflated-byte ceiling applies per archive. Compressed and inflated representations can temporarily coexist, and multiple selected archives can consume cumulative work beyond one archive's ceiling, so peak memory can substantially exceed the selected file size. Files close to the 500 MB input ceiling may still fail on a memory-constrained browser.

## Performance

The design target is usability around 10,000 messages on a modern laptop, but it has not been validated as a formal benchmark. Speed and memory use vary with:

- archive compression and entry structure;
- total text length;
- number of unique terms and phrase candidates;
- browser, CPU, and available memory;
- active filter combination.

A Web Worker protects the React rendering thread from parsing and analysis work but does not reduce total CPU or memory cost. Progress stages are qualitative rather than precise percentages. Cancellation terminates the worker; it is not cooperative inside a synchronous ZIP or analysis call. A browser `File.arrayBuffer()` already in progress cannot be stopped, but its late result is rejected by an operation-generation guard. Filter updates reuse normalized conversations and avoid reparsing files, but the current PoC structured-clones the normalized message strings back to the worker on each update.

Most automated fixtures are intentionally small. One request-order E2E regression exercises 10,000 simple conversations / 20,000 short messages, but that is not representative of long real exports, deep graphs, or large ZIP inflation. Aggregate retention counts normalized output; rejected system/tool/empty candidates are still bounded by per-parser, file, and archive ceilings rather than one shared attempted-record counter. Adversarial multi-file input can therefore consume more work than its retained result suggests. Large-corpus capacity remains a measured-work item rather than a guarantee.

## Browser and rendering differences

System font availability changes rendered glyph metrics and therefore may cause small visual differences across operating systems. Collision boxes use a deterministic script-aware width estimate rather than browser `measureText`; unusual glyphs or fallback fonts may render closer than the model predicts. Unit bounds/collision checks and the Chromium demo screenshot cover the tested fixture, not every font or imported term set.

PNG creation draws a dedicated 2,200 × 1,340 card directly on a local Canvas. Browser Canvas support, font rendering, memory pressure, or download policies can still make export fail. The UI surfaces a recoverable Japanese status, and clear-data aborts a delayed export before it can create an object URL or download.

The 1440 × 1000 and 390 × 844 layouts are acceptance baselines, not guarantees for every browser zoom level, accessibility text scaling, embedded webview, or unusually narrow viewport.

## Privacy scope

Promptprint is designed to make no runtime request containing imported text and to avoid durable raw-message storage. Automated network and storage guards cover tested flows, but users should still:

- run a trusted build;
- inspect extensions or browser software that can observe local pages;
- avoid importing sensitive histories on a shared or compromised device;
- understand that downloaded PNG files leave browser memory and become ordinary local files.

The privacy guarantee does not cover the browser, operating system, installed extensions, screen-capture software, backup tools, or files a user manually shares. The automated exact-origin network guard, demo/real-import storage checks, and export-string guards cover the tested Chromium flows only; they are not a formal audit of every browser or future provider schema.

## PNG content

The share image intentionally omits:

- raw messages and excerpts;
- conversation titles;
- email addresses;
- hidden terms;
- diagnostic source details.

It contains aggregate terms and counts, which may themselves reveal sensitive interests. Users should review the preview and hide sensitive terms before sharing.

## Provider comparisons

When both providers are present, the comparison describes one user's imported ChatGPT and Claude usage. Differences may reflect topic choice, time period, prompt style, or export completeness. They are not an objective comparison of model personalities or capabilities.

## Not supported by this PoC

- server upload or sync;
- accounts, authentication, and collaborative workspaces;
- public sharing automation;
- browser extensions or native mobile applications;
- embeddings, semantic topic modeling, or external LLM analysis;
- perfect entity recognition, quotation detection, or causal inference;
- every historical or future provider export schema.

## Reporting problems safely

When reporting an import failure, prefer:

- provider name;
- export date or product version if known;
- filename pattern;
- root JSON type and anonymized key names;
- safe counts;
- exact Promptprint diagnostic code.

Do not attach private conversation content unless it has been intentionally anonymized.
