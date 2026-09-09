# Promptprint limitations

Promptprint is a local, exploratory proof of concept. Its output describes patterns in the imported corpus; it does not diagnose the user, judge answer quality, or establish causal influence.

## Three-dimensional distribution

3D is an optional descriptive scatter plot, not a topic map or a replacement for the more directly readable 2D Mirror Cloud. Role bias, role-balanced message incidence and conversation coverage are related metrics. Y is not the pooled proportion across all messages when role totals differ. Z describes only the current selected/imported corpus, not unseen history. Low-incidence words can cluster near the floor because the 0–100% scale is fixed; the view intentionally does not magnify each period independently.

Camera depth contributes to projected screen-left/right; read X-axis direction, not screen halves. Orthographic projection and constant dots avoid false perspective-size encoding, but identical or projected-coincident points remain visually superimposed. Use the selector to reach every term. Label placement may omit text or shorten long labels; omitted-label counts do not mean omitted statistical observations. 3D reuses the 2D-selected subset, so 2D quota/compound/hidden/layout omissions still apply and are reported. Changing mode does not recover omitted candidates. A sparse dataset may be easier to read in 2D.

Screen and PNG share world metrics and camera but fit different aspect ratios; label choice and pixel scale can differ. SVG/Canvas are bounded to at most the existing 120 selected terms, not a million-point renderer. No WebGL, perspective, semantic embeddings, drag-to-edit statistics, free camera flight, point morphing, or video export is included. Mobile testing is Chromium viewport emulation, not a claim of physical-phone validation.

## Date filtering and playback

Dates use fixed Japan Standard Time, not the operating system timezone. Missing message timestamps fall back to conversation creation/update; this is approximate, especially for long-running threads. Completely undated messages appear only in all-time analysis. Context keeps the original message date (and explicitly marks it unknown), separate from a fallback used for period membership. Relative “1 year” means 365 calendar days including today.

Playback reanalyzes each window locally, then waits the selected dwell time; large corpora can take substantially longer than that interval. At most 366 daily/monthly frames are allowed. There is no movie export, interpolation, forecast, sliding multi-day window or cross-frame font-size calibration. Size reflects relative importance within each frame; word positions may jump as actual period statistics change. In-flight work finishes once after pause. Source acquisition and private playback do not run concurrently. Settings/frame results are not persisted in the ordinary Web build; private stored conversations remain under its separate existing retention controls.

## Morphology is not semantic understanding

The production extractor now uses locally bundled Japanese kuromoji/IPADIC morphology and English wink contextual POS, rather than treating every `Intl.Segmenter` wordlike fragment as a possible topic. This provides grammatical evidence, not a general understanding of conversation meaning. IPADIC is an older dictionary; slang, modern product names, spellings, proper names and mixed-language text can still split or receive the wrong POS. English contextual tagging also makes errors, including nouns used after certain verbs and unknown technical vocabulary. Nominal status alone does not prove a word is an interesting subject.

Default selection requires eligible nominal usage in at least half of the messages containing a candidate. It excludes standalone procedural forms and ranks surviving candidates by repeated-message evidence and inverse conversation coverage. That ranking can favor a concentrated side discussion over a broad recurring interest, or retain a repeated technical-looking artifact. The positive floor preserves ubiquitous themes, but no relevance/interestingness guarantee follows. **使用語を広く** restores eligible broad vocabulary; it cannot restore removed grammar, malformed spans or hidden terms.

Grammatical phrases require two distinct messages and bounded noun/modifier sequences, not an NPMI association threshold. Japanese compounds have at most six atoms; English at most four, and both span at most 40 UTF-16 units. Longer concepts may remain split. Japanese whitespace lists are deliberately not joined. The productive nominal-ending rules can retain real derived terms such as 回答率 but are not a semantic ontology. A displayed phrase is an actually observed recurring surface pattern, not a verified entity or a generated topic label.

Large-corpus phrase admission is approximate: a fixed 6 MiB Count-Min sketch estimates message support for a deterministic 100,000-key candidate pool. Hash collisions or capacity can affect which phrases are examined. The selected keys are then counted exactly over all messages, and only complete phrase families fitting a 500,000-position budget are retained. An over-budget family is omitted, never partially counted. Thus returned phrase measurements are complete, but candidate recall is not guaranteed; a cap warning does not mean all phrases vanished or provide an exact count of unseen vocabulary. Narrowing dates/provider can admit different candidates. Exact-DF tie-breaking favors longer complete compounds and can omit useful shorter variants under heavy load.

Unknown all-hiragana runs are conservatively rejected, while dictionary-recognized hiragana nouns are not globally excluded. This can lose unfamiliar kana names or spellings. Prefix/suffix atoms and single-character Japanese noun atoms may contribute to compounds without appearing alone. Japanese adjectival noun stems use a bounded following-context rule to distinguish predicates from nominal uses, so ambiguous ellipsis or unusual grammar can still be classified imperfectly; the rule is not a ban on emotion/evaluation topics. Exact acknowledgments such as `はい` / `いいえ` / `OK` / `yes` / `no` remain excluded even when a person literally discusses those expressions. Orthographic acronym and programming-identifier rules are bounded, not complete identifier recognition. The hidden-term feature remains the final user control over visible and exported vocabulary.

Original observed forms and UTF-16 spans are preserved; lemmas are not substituted. A noun's accepted verb uses can still contribute to its measurements once the term qualifies, because mode selection does not rewrite the common occurrence ledger. Response-only messages remain in the denominator of “その語を含む発言の割合” and in original context, but add zero accepted content tokens. The new grammatical ledger can differ from earlier releases; surviving terms are invariant between topic/broad modes for the same corpus and settings, not across tokenizer revisions.

Dictionary initialization requires the fixed files bundled with the app. The ordinary Web build reads them from the same origin, and the private extension from its package; neither sends conversation text. A missing/corrupt dictionary fails explicitly instead of silently using a lower-quality tokenizer. Japanese lattice work uses 256-unit windows with 64-unit look-ahead. Extremely long indivisible runs become reported non-lexical boundaries rather than fabricated chopped terms. IPADIC covers BMP characters; surrogate pairs, including supplementary Han, are treated as boundaries, so rare names using those characters can lose lexical coverage. English context is limited to 128 tokens; a boundary can affect its contextual POS decision.

Pinned models and deterministic extraction avoid dependence on the host's `Intl.Segmenter` topic segmentation. This does not promise identical typography or exhaustive behavior across every JavaScript engine, font or language.

## Frequency is not importance or truth

Font size reflects a documented importance score derived mainly from message-document frequency and conversation coverage. It does not show:

- factual importance;
- emotional importance;
- correctness;
- agreement;
- topic quality;
- how much time the user spent on a subject.

The displayed message occurrence rate is the fraction of a role's messages containing that term. It is **not length-corrected**: long messages have more opportunities to contain a word. Shared means actual observations on both sides and an empirical rate difference within the documented bias threshold, not proven equivalence, agreement or sufficient statistical power. One missing role is explicitly comparison-insufficient, never shared.

The supplementary per-1,000-token rate counts accepted cleaned lexical atoms, not model/billing tokens. Grammar/noise, code/quotes (when enabled), URLs, emails and hidden words are excluded consistently from occurrence counts and token totals. Non-topic words and compound-building prefix/suffix atoms can remain denominator tokens even when not individually displayed. Returned grammatical phrase windows use the same stream and have complete occurrence counts; phrase windows are not extra denominator tokens.

Display-only compound representation requires >=80% positional containment in the same longer phrase and at least two covered occurrences. This is a transparent heuristic, not semantic synonym detection: 20% independent usage can still be hidden at the exact boundary; 30% remains eligible. Aggregate counts remain intact. Candidate selection and mobile side quotas, as well as layout omissions, mean displayed word proportions are not original-data proportions. Strongly one-sided corpora intentionally leave the other half empty. Font scaling can reach the common legibility floor, making low-ranked sizes equal; long or dense terms may be omitted rather than moved across the chart.

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

Fenced code, inline expressions, recognized shell-prompt lines, complete TeX/math notation, block quotes, URLs, emails, obvious paths, and common noise are removable. The code-exclusion switch also controls those source-notation rules. Inline code retains one bounded ASCII identifier (at most 64 units, such as React, useEffect, Node.js or C++) between hard boundaries, not arbitrary source expressions. Markdown labels also remain between boundaries. These exceptions preserve possible subject names but are not complete code-entity recognition. Formula/code content can still be omitted even when it is the subject of discussion; unmatched delimiters or unrecognized commands can remain. Promptprint cannot reliably detect every pasted article, citation, transcript, quoted paragraph, generated template, or attachment-derived text. Such material can influence counts and apparent role bias.

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
| Japanese morphology | 100,000 UTF-16 units/message; 256-unit lattice windows with 64-unit look-ahead; indivisible overlong runs become counted non-lexical boundaries |
| English POS | 128-token context windows; 256 units per accepted tagger input; overlong tokens are marked non-lexical |
| grammatical phrase shape | 2–6 Japanese/mixed atoms or 2–4 English atoms; 40 UTF-16 units; two supporting messages |
| phrase work | 6 MiB support sketch; 100,000 candidate keys; 500,000 positions in complete retained families; every returned phrase has full-corpus counts; budget exclusions are disclosed |
| context lookup | first 200,000 source characters, 20 excerpts per selected term, roughly 190 characters per excerpt |

These are safety ceilings, not recommended dataset sizes. The normalized-output ceiling is shared across selected files and selected ZIP entries; later sources are skipped once either aggregate count is exhausted. ZIP decompression is synchronous inside a Web Worker rather than streaming, and the 200 MB inflated-byte ceiling applies per archive. Compressed and inflated representations can temporarily coexist, and multiple selected archives can consume cumulative work beyond one archive's ceiling, so peak memory can substantially exceed the selected file size. Files close to the 500 MB input ceiling may still fail on a memory-constrained browser.

## Performance

The design target is usability around 10,000 messages on a modern laptop, but it has not been validated as a formal benchmark. Speed and memory use vary with:

- archive compression and entry structure;
- total text length;
- number of unique terms and phrase candidates;
- browser, CPU, and available memory;
- active filter combination.

A Web Worker protects the React rendering thread from parsing and analysis work but does not reduce total CPU or memory cost. The shipped IPADIC files are 17,791,956 compressed bytes and expand to 100,260,388 bytes before indexes, lattice allocations, conversation data and the English model. Initialization is one-time per worker, not per message, but creating another worker repeats that cost. Large histories and constrained mobile devices can require substantial time/memory or fail safely; the ceilings are not a capacity guarantee.

Progress stages are qualitative rather than precise percentages. Cancellation terminates the worker; it is not cooperative inside a synchronous ZIP or analysis call. A browser `File.arrayBuffer()` already in progress cannot be stopped, but its late result is rejected by an operation-generation guard. Ordinary Web filter updates avoid reparsing files but structured-clone normalized messages back to the worker. The private worker retains its corpus by revision; a worker-local lexical cache reuses identical message objects/text/cleaning signatures under an 8,000,000-character admission ceiling. Cache misses or cap exhaustion affect speed, not the promised counting definitions. No linguistic cache is written to durable storage by this analysis layer.

Most automated fixtures are intentionally small. One request-order E2E regression exercises 10,000 simple conversations / 20,000 short messages, but that is not representative of long real exports, deep graphs, or large ZIP inflation. Aggregate retention counts normalized output; rejected system/tool/empty candidates are still bounded by per-parser, file, and archive ceilings rather than one shared attempted-record counter. Adversarial multi-file input can therefore consume more work than its retained result suggests. Large-corpus capacity remains a measured-work item rather than a guarantee.

## Browser and rendering differences

System font availability changes rendered glyph metrics and therefore may cause small visual differences across operating systems. Collision boxes use a deterministic script-aware estimate. SVG contracts unexpectedly wide local-font glyphs into the reserved width; PNG uses the same allowance and a collision-preserving scale. Automated geometry/ink checks cover Chromium, Japanese/Latin demo terms and dense one-sided fixtures, not every font, script, browser or imported vocabulary. Very unusual vertical font metrics remain a cross-browser QA limitation.

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

## Not supported by the ordinary Web PoC

- server upload or sync;
- accounts, authentication, and collaborative workspaces;
- public sharing automation;
- general-purpose browser integration or native mobile applications (the separately authorized personal extension remains private and governed by `docs/PRIVATE_LOCAL.md`);
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

## Reading topic selection correctly

The production selection-only score is `ln(1 + D) × (1 + ln((C + 1)/(c + 1))) × D/(D + 2)`, using candidate message DF `D`, selected conversation count `C` and candidate conversation coverage `c`. It is not the former capped 35% coverage bonus, a score from an external reference population, or an encoding of semantic similarity. Letter size still uses the separate documented message/conversation importance score. Changing selection mode can alter the set's relative font scaling, so identical statistical values need not have identical pixel sizes in two differently selected clouds. Read source contexts when a label looks surprising.
