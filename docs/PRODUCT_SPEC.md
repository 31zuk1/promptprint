# Promptprint PoC — Product specification

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
- user document frequency and normalized rate;
- AI document frequency and normalized rate;
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

Show important terms with near-balanced role-normalized rates.

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

Do not build:

- personality or mental-health diagnosis;
- automatic public sharing;
- server upload, user accounts, authentication, or cloud sync;
- browser extensions or native mobile applications;
- embeddings or an LLM-based topic model;
- perfect causal attribution;
- perfect support for all historical export schemas.

## 15. Honest limitations

The UI or documentation must state:

- segmentation and phrase extraction are heuristic;
- provider export formats can change;
- Claude import remains experimental until validated against more real exports;
- AI-first means temporal association, not causation;
- frequency is not importance or truth;
- pasted or quoted source text may affect counts despite exclusion heuristics.
