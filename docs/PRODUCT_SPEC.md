# Promptprint PoC — Product specification

## Source-grounded topic vocabulary (redesign, 2026-09-09)

Default **話題を優先** selects observed nouns and recurring grammatical noun phrases, not arbitrary wordlike fragments or every frequent expression. Japanese uses a bundled morphological dictionary and English uses a bundled contextual part-of-speech model. Both run locally in the analysis worker. Particles, auxiliary forms, acknowledgments, punctuation and removed source spans remain phrase boundaries. The model does not invent topic labels, merge synonyms, call an external LLM, or fill an empty cloud with rejected candidates.

Topic selection requires eligible nominal usage in at least half of the messages containing a candidate, then ranks it by repeated-message evidence and inverse conversation coverage. This favors more specific subjects over expressions repeated indiscriminately across conversations, while retaining a nonzero weight for themes present throughout the corpus. It is corpus-local lexical selection, not proof of semantic understanding or a universal relevance score. Standalone procedural forms are omitted; compounds such as 説明変数 and 回答率 can retain their actual meaning-bearing constituents. English adjective-plus-noun phrases such as general relativity remain possible without treating every English word as a noun.

**使用語を広く** restores eligible non-topic vocabulary for inspecting wording and response style. Both modes use the same observed-form lexical ledger, message denominators, token totals, role rates, bias, importance and source spans. No lemma is substituted for a word the speaker did not actually use. The new dictionary-based ledger can differ from earlier releases; changing only the display mode never changes surviving-term measurements. The selection score is not the font-size or coordinate metric.

Noun phrases require two distinct supporting messages, including within one focused conversation. Japanese compounds contain up to six adjacent atoms; English phrases up to four, with a noun head. Punctuation, Japanese whitespace lists, verbs, removed grammar and hidden spans cannot be bridged. Independently used components remain eligible under the existing positional-containment rule. Dictionary mistakes, unfamiliar vocabulary and pasted material can still affect the result; source-context inspection remains essential.

The committed selection mode and candidate exclusion count accompany the cloud and PNG. Counts distinguish display-policy exclusions, compound representation, physical layout omissions and the mobile overview subset. The selected word count is an upper limit. The same eligibility policy covers 2D, 3D, timeline frames, insights and provider summaries; Echo and adoption calculations still use the common prepared corpus, with only adoption presentation filtered. Clicking a selected word opens its actual source context. Broad mode does not restore punctuation, grammatical noise, unsafe fragments or hidden words. Dictionary loading failure is an explicit recoverable error, never a silent return to the old heuristic-only extraction.

## Selectable 3D distribution (owner request, 2026-09-09)

The default remains **2D ミラー**. **3D 分布** is an alternate view in the same dashboard, not a new screen. It answers whether vocabulary with similar role bias and message incidence is spread across many conversations or concentrated in a few. X is −bias (user −1, AI +1); Y is the equal-weight mean of the role-specific message incidence rates; Z is the fraction of currently selected conversations containing the term. When only one role is present, Y uses that observed role and X=0 is marked comparison-insufficient, never shared. Rates use fixed 0–100% domains across dates; X uses −1–1.

The same selected terms are used in both views, including existing hidden/compound/selection/2D-layout omissions. Every selected term has an exact point; overlaps are not displaced or removed. Labels are selectively placed with leaders; their omission count is visible, and the selector exposes all points even at identical coordinates. Empty or sparse results are explicit. Point and label sizes are constant and do not encode a fourth metric. Distance is not semantic similarity; these are related descriptive statistics, not an independent topic space.

The orthographic view supports bounded rotation/zoom, keyboard arrows, reset, and touch-safe buttons. After rotation, screen-left is not itself user dominance: read the labeled X axis. The paper/palette remains familiar, but a screen-left/right gradient is deliberately absent in 3D. View/camera changes pause chronological playback without reanalysis or transmission. Period filtering and playback also work in 3D. PNG uses the current mode, camera, committed period and aggregate-only privacy rules; output dimensions are independently fitted, so label selection can differ from the screen.

## Local chronological preview (owner request, 2026-09-09)

The existing cloud has a compact date/playback control, shared by Web import/demo and the isolated private build. Dates are inclusive Japanese calendar days (JST), based on each message's date, falling back to conversation creation then update. All-time retains undated messages; bounded periods exclude them and disclose the count. A conversation can therefore contribute different messages to different periods. Missing conversation dates are never invented from import/fetch time.

Choose arbitrary start/end bounds, or day/month playback of that range. Window mode shows that calendar period only; cumulative mode shows the chosen start through the current period end. Empty periods remain visible. The last frame stops automatically; replay after the last frame starts over. Pause retains the current/in-flight frame, and resume continues from there. Each completed frame dwells for 1/2/4 seconds before the next analysis begins; processing time is additional. No frames are interpolated, cached as a movie, or uploaded.

Visible dates belong to the completed result, not the next requested frame. PNG is a still image of that result and includes the selected period. Font sizes remain relative within each frame, not a calibrated absolute scale across periods. Existing X/size/Y explanations remain visible. Open-ended filtering is allowed, but playback requires both bounds and at most 366 frames; choose monthly playback or a shorter range for longer histories.

## 1. Product thesis

Chat histories contain two related but distinct vocabularies:

- words and concepts the user repeatedly brings to AI;
- words, frames, caveats, and abstractions AI repeatedly returns.

A conventional word cloud collapses those vocabularies into one bag. Promptprint instead visualizes the exchange itself.

The primary artifact is a **Mirror Cloud**:

- left: terms disproportionately used by the user;
- center: terms commonly used by both;
- right: terms disproportionately used by AI;
- size: how broadly and repeatedly a term appears;
- color: semantic side and degree of bias;
- interaction: select a term to inspect local source contexts.

The proof of concept must be immediately interesting with synthetic demo data and useful with a real ChatGPT export.

## 2. Target user and core job

The target user is a frequent ChatGPT or Claude user who wants to understand how they use AI and how AI may be shaping their language.

Core job:

> Show me the language fingerprint of my AI use without uploading my private history anywhere.

## 3. Product identity and tone

- Name: **Promptprint**
- Japanese tagline: **AIとの会話から、言葉の指紋を見る。**
- Tone: analytical, curious, and privacy-conscious.

The product must not present pseudo-psychological diagnoses, claim that frequency equals importance or truth, or imply that temporal ordering proves causation.

## 4. Primary flow

### 4.1 Landing and empty state

Show:

- Promptprint name and tagline;
- a simple centered, single-column landing without decorative rainbow rules or a permanent import frame;
- the headline-to-privacy group centered horizontally and vertically against the full viewport, with centered button labels and optically trimmed terminal punctuation; compact-height spacing keeps the group visible, while extremely short windows may scroll rather than clip;
- large, full-width actions stacked vertically: primary `デモを見る`, then secondary `ファイルを選ぶ`;
- a borderless local-file drop area with a short drop hint and temporary feedback while dragging;
- supported-input note: ChatGPT ZIP/JSON and Claude ZIP/JSON（実験的）;
- privacy statement `会話データはブラウザの外へ送信されません`;
- a short import → local analysis → explore/export explanation.

A user must reach a populated visualization within two clicks.

### 4.2 Import progress

Use named stages rather than a fake precise percentage:

1. `ファイルを確認中`
2. `会話を読み込み中`
3. `テキストを正規化中`
4. `単語とフレーズを集計中`
5. `レイアウトを生成中`

The user can cancel. A failure shows a plain-Japanese diagnosis, safe detected filenames or shapes, and recovery suggestions. Raw private text must not appear in diagnostics.

### 4.3 Analysis dashboard

Provide one responsive continuous page: a full-viewport Mirror Cloud overview followed immediately by a normal document-flow analysis section containing:

1. a labelled, safe-area-aware analysis toolbar;
2. visible privacy status in the opening state;
3. dataset summary cards and a persistent four-point insight summary;
4. folded filters and detailed insight cards;
5. term-context drawer or modal;
6. PNG export and data-clear actions.

Analysis must be reachable by ordinary downward scrolling without an intermediate button. Do not render an opening rail or cropped representative-cloud preview between the full cloud and analysis. The boundary is direct, non-overlapping normal flow; do not use scroll-linked blur or scaling.

## 5. Dataset summary

Show at least:

- conversation count;
- user-message count;
- assistant-message count;
- detected provider or providers;
- covered date range, or `日時情報なし`;
- analyzed-term count.

If records are skipped, do not imply complete parsing. Show an honest diagnostic count and expandable safe detail.

## 6. Filters

Required controls:

- provider: all / ChatGPT / Claude;
- time: all / last 30 days / last 90 days / last year, with custom range if practical;
- term count: 40 / 60 / 80 / 120;
- term type: words + phrases / words only;
- exclude fenced code, enabled by default;
- exclude block quotes, enabled by default;
- exclude URL and email-like strings, always enabled;
- automatic sensible minimum message-document frequency, with an advanced override;
- sensitive-word hide list, including the ability to hide a selected term.

A filter change recomputes statistics and layout through the same worker-backed pipeline. A hidden term disappears from both the cloud and exported image.

## 7. Mirror Cloud

### 7.1 Visual language

Use `docs/reference/wordcloud-reference.jpeg` as visual inspiration, not as a literal layout.

Desired qualities:

- a full-bleed primary canvas on desktop followed by compact rounded summary surfaces in the analysis section;
- warm paper, plain typography, and one static monochrome grain layer across landing, cloud, analysis, and PNG; the landing stays neutral and minimal, with the blue → violet → orange gradient reserved for visualization surfaces rather than decorative headline or brand rules;
- abundant intentional whitespace;
- bold words with meaningful size differences;
- no word rotation by default;
- polished enough to screenshot and share;
- local or system fonts only;
- semantic direction `あなた ← 共有語彙 → AI`;
- a subtle center guide and edge labels rather than a heavy chart axis.
- on pointer hover, the selected term may rise by at most 2 px and scale by at most 1.5%, while keyboard focus remains position-stable and visibly outlined;

Semantic colors:

- user-dominant: blue or cyan family;
- shared: violet family;
- AI-dominant: orange or coral family.

Small deterministic shade variation is acceptable when contrast remains sufficient and side meaning stays clear. Position and labels must duplicate the color meaning.

### 7.2 Tooltip

Hover or keyboard focus shows:

- term;
- user and AI message-document frequency, role message total and empirical message occurrence rate (the proportion of that role's messages containing the term, not length-adjusted);
- role occurrences per 1,000 cleaned content tokens and their occurrence/token totals;
- conversation coverage;
- user / shared / AI bias label;
- provider coverage when multiple providers are present.

### 7.3 Context drawer

Click or Enter opens a local context view with up to 20 occurrences:

- conversation title;
- provider;
- role badge;
- date when available;
- short excerpt clipped around the match;
- selected term highlighted;
- user / AI / both toggle.

It provides no automatic copying or external links. Escape closes it and focus returns to the selected term.

## 8. Insight cards

### 8.1 ユーザーが持ち込む言葉

Show important, strongly user-biased terms. Avoid rare one-off curiosities.

### 8.2 AIが返す言葉

Show important, strongly AI-biased terms. Describe the imported corpus only; do not imply a universal model personality.

### 8.3 共有語彙

Show important terms actually observed in both roles with near-balanced empirical message occurrence rates (`abs(bias) < 0.18`). A zero observation is not shared. If a role has no analyzed messages, use an explicit neutral comparison-insufficient state and exclude the terms from shared insights.

The cloud always explains: left/right = relative usage tendency, size = logarithmic message-document frequency/conversation-coverage score, vertical = no meaning. Keep source (synthetic demo or imported data), providers, period and conversation count visible. Disclose quota selection and show layout omissions; displayed word-count ratios are not corpus ratios. A user/AI-dominant word must never cross to the opposite half to fill space. Prefer vertical displacement and bounded X movement; use common size scaling or omission on desktop, mobile and PNG.

### 8.4 語彙エコー率

Display the weighted share of salient user terms reused in the immediately following assistant response, together with eligible pair count and confidence.

Always show:

> 高いほど良い／悪いという指標ではありません。語彙の再利用度です。

### 8.5 AI先行観測語

Show conservative candidates first observed in assistant text and then used repeatedly by the user in later turns or conversations.

Always show:

> AIが教えたことを証明するものではありません。時系列上、AI側で先に観測された候補です。

Hide the card when temporal evidence is insufficient. Mark the feature experimental.

### 8.6 Provider comparison

Show only when two providers are present. Label it `あなたのChatGPT利用とClaude利用の比較`, never as an objective personality comparison between models.

## 9. PNG export

Export a clean, legible share card containing:

- Promptprint title and tagline;
- Mirror Cloud;
- small legend;
- aggregate counts and date range;
- optional selected insight chips;
- a privacy note equivalent to `Local analysis / raw messages not included`.

It must not contain raw excerpts, conversation titles, email addresses, or hidden terms. Use a filename beginning with `promptprint-`, such as `promptprint-2026-08-31.png`.

## 10. Data clearing

The visible, low-priority `解析データを消去` action remains in the analysis footer rather than the primary toolbar, and must:

- terminate active workers;
- remove normalized messages and term/context indexes from memory;
- revoke object URLs;
- clear only Promptprint-owned non-sensitive temporary cache, if any;
- return to a reusable empty state.

## 11. Synthetic demo

Provide a Japanese-first synthetic dataset with at least 12 conversations and repeated structure sufficient for a compelling cloud.

Suggested topic families:

- robotics and implementation;
- political research and data analysis;
- study abroad and admissions;
- business validation;
- travel planning.

Seed tendencies:

- user-biased: `北朝鮮`, `ロボット`, `留学`, `研究`, `事業`;
- AI-biased: `要件`, `制約`, `リスク`, `優先順位`, `検証`;
- shared: `データ`, `実装`, `可能性`;
- assistant-first then user-adopted candidate: `交絡要因`.

Do not use a real person's private text. Represent the demo as source conversations and process it through the same normalization, analysis, and layout path used for imported files.

## 12. Errors and resilience

The application remains reusable after malformed input or cancellation. It provides recoverable Japanese messages for:

- corrupted JSON;
- unrelated or unsupported JSON;
- empty ZIP archives;
- oversized or otherwise unsupported inputs;
- supported files containing partially skipped records.

No tested flow may produce an unhandled rejection or misleading success state.

## 13. Responsive and accessible behavior

At a 1440 × 1000 viewport:

- information hierarchy is immediately clear;
- the cloud is the dominant visual element;
- labels are natural Japanese;
- controls are not clipped and text is readable;
- terms remain within bounds without severe overlap.

At approximately 390 × 844:

- import and dashboard remain operable;
- the initial cloud shows a deterministic role-balanced SVG overview of up to 24 terms across user, shared, and AI regions;
- a labelled detail mode exposes the selected 40/60/80/120-term layout through intentional horizontal panning with a centered start, edge fades, and a position indicator;
- primary controls are not cut off;
- the context drawer remains usable and closable.

All term interactions work with keyboard focus and Enter. Interactive elements have visible focus, semantic names, and sufficient contrast.

## 14. Non-goals

The ordinary Web product retains these non-goals. The owner's separately authorized, unpublished personal extension is governed by `docs/PRIVATE_LOCAL.md`; this extraction redesign does not add acquisition permissions, remote services or publication.

Do not build into the ordinary Web product:

- personality or mental-health diagnosis;
- automatic public sharing;
- server upload, user accounts, authentication, or cloud sync;
- browser extensions or native mobile applications;
- embeddings or an LLM-based topic model;
- perfect causal attribution;
- perfect support for all historical export schemas.

## 15. Honest limitations

The UI or documentation must state:

- local morphological/POS models and noun-phrase rules can misclassify words; topic selection is not semantic understanding;
- provider export formats can change;
- Claude import remains experimental until validated against more real exports;
- AI-first means temporal association, not causation;
- frequency is not importance or truth;
- pasted or quoted source text may affect counts despite exclusion heuristics.
