# Promptprint PoC — Acceptance criteria

Every item marked **MUST** is part of the definition of done. A **SHOULD** item may remain incomplete only when its tradeoff is recorded in `docs/EXECPLAN.md`.

## A. Repository and startup

- [x] **MUST** `pnpm install` succeeds from a fresh checkout.
- [x] **MUST** `pnpm dev` starts without a required environment variable.
- [x] **MUST** `pnpm build` creates a static `dist/` bundle.
- [x] **MUST** no backend, database, API key, or login is required.
- [x] **MUST** `README.md` contains exact setup and run commands.

## B. Empty state and demo

- [x] **MUST** first load shows the title, tagline, local-file drop zone, privacy statement, `デモを見る`, and `ファイルを選ぶ`.
- [x] **MUST** demo reaches a populated dashboard within two clicks.
- [x] **MUST** demo uses synthetic normalized conversations and the real analysis pipeline.
- [x] **MUST** demo visibly contains user-biased, shared, and AI-biased terms.
- [x] **MUST** `ロボット`, `研究`, `要件`, `リスク`, and `交絡要因` appear in relevant demo views.

## C. ChatGPT import

- [x] **MUST** accept raw JSON and ZIP.
- [x] **MUST** find one or multiple likely conversation JSON entries in a ZIP.
- [x] **MUST** parse graph/mapping exports and select the current branch.
- [x] **MUST** a unit fixture contains a discarded-branch sentinel and verifies its exclusion.
- [x] **MUST** skip system, developer/context, tool, and execution-output messages.
- [x] **MUST** preserve role, conversation title, stable order, and available timestamps.
- [x] **MUST** malformed or unsupported data produces diagnostics without crashing.

## D. Claude import

- [x] **MUST** provide an experimental Claude adapter with conservative schema detection.
- [x] **MUST** support at least one representative conversations/messages fixture.
- [x] **MUST** tolerate common role and content-field variants.
- [x] **MUST** unsupported shapes show safe root/top-level diagnostics, not raw content.
- [x] **MUST** UI and limitations documentation clearly label Claude support experimental.

## E. Analysis

- [x] **MUST** clean fenced code, block quotes, URLs, emails, and whitespace according to settings.
- [x] **MUST** tokenize mixed Japanese and English locally and deterministically.
- [x] **MUST** primary statistics use message-document frequency and role-normalized rates, not raw token count alone.
- [x] **MUST** compute role bias, importance, conversation coverage, and stable display forms.
- [x] **MUST** support selected phrases and words-only mode.
- [x] **MUST** filter stopwords, noise, and hidden terms.
- [x] **MUST** calculate Echo rate with sample size, confidence, and the lexical-reuse caveat.
- [x] **MUST** calculate AI-first candidates conservatively and label them non-causal.

## F. Mirror Cloud

- [x] **MUST** left means user-dominant, center means shared, and right means AI-dominant.
- [x] **MUST** size encodes importance and semantic color encodes role bias.
- [x] **MUST** layout is deterministic for identical data and settings.
- [x] **MUST** demo has no severe word overlap at a 1440 × 1000 viewport.
- [x] **MUST** all words remain within the cloud card bounds.
- [x] **MUST** words are not rotated by default.
- [x] **MUST** hover and focus expose term statistics.
- [x] **MUST** click and Enter open local context with highlighted matches.
- [x] **MUST** keyboard users can focus terms and close the drawer with Escape.
- [x] **MUST** focus returns to the activated term when the drawer closes.

## G. Filters and updates

- [x] **MUST** provider, time range, term count, word/phrase mode, code exclusion, and quote exclusion controls exist.
- [x] **MUST** changing a filter updates statistics and layout through the analysis pipeline.
- [x] **MUST** a user can hide a term and it disappears from cloud and PNG.
- [x] **SHOULD** changing display count avoids fully duplicating file parsing.

## H. Insights

- [x] **MUST** provide cards for user-introduced terms, AI-returned terms, and shared vocabulary.
- [x] **MUST** Echo rate explains that it is lexical reuse, not answer quality.
- [x] **MUST** AI-first states that temporal association is not causation.
- [x] **MUST** provider comparison is hidden unless two providers are present.
- [x] **MUST** provider comparison is framed as this user's usage rather than objective model personality.

## I. Privacy and data lifecycle

- [x] **MUST** runtime conversation analysis stays in-browser.
- [x] **MUST** there is no analytics, telemetry, remote font, CDN runtime script, or third-party API request.
- [x] **MUST** raw conversations are not persisted in `localStorage`, IndexedDB, cookies, or caches.
- [x] **MUST** `解析データを消去` returns to the empty state and releases in-memory state, workers, and object URLs.
- [x] **MUST** PNG contains no raw excerpt, conversation title, email address, or hidden term.
- [x] **MUST** E2E network guard fails on an unexpected third-party host.

## J. PNG export

- [x] **MUST** demo mode exports a legible PNG.
- [x] **MUST** exported image includes title, cloud, legend, aggregate counts, and date range.
- [x] **MUST** hidden terms remain hidden.
- [x] **MUST** output filename begins with `promptprint-`.
- [x] **MUST** E2E verifies a non-empty PNG download.

## K. Errors and cancellation

- [x] **MUST** corrupted JSON produces a recoverable Japanese message.
- [x] **MUST** unrelated JSON produces a recoverable Japanese message.
- [x] **MUST** an empty ZIP produces a recoverable Japanese message.
- [x] **MUST** oversized or unsupported input produces a recoverable Japanese message.
- [x] **MUST** tested flows produce no unhandled promise rejection.
- [x] **MUST** diagnostics report parsed and skipped counts honestly.
- [x] **MUST** cancellation leaves the application reusable.

## L. Tests and evidence

- [x] **MUST** `pnpm typecheck` passes.
- [x] **MUST** `pnpm lint` passes.
- [x] **MUST** `pnpm test` passes.
- [x] **MUST** `pnpm build` passes.
- [x] **MUST** `pnpm e2e` passes.
- [x] **MUST** `pnpm check` passes.
- [x] **MUST** unit tests cover ChatGPT active branch, content extraction, cleaning, bias sign, Echo rate, adoption, deterministic layout, and collision/bounds.
- [x] **MUST** E2E covers demo, context, filter change, malformed import, PNG download, data clearing, and the network guard.
- [x] **MUST** Playwright writes `artifacts/promptprint-demo.png` at 1440 × 1000 or similar.
- [x] **MUST** browser console errors are checked during E2E.

## M. Visual review

At 1440 × 1000:

- [x] **MUST** hierarchy is immediately clear.
- [x] **MUST** the cloud is the dominant visual element.
- [x] **MUST** the reference qualities are present: pale full-bleed gradient, bold varied-size words, and intentional whitespace, with rounded summary surfaces reserved for grouped results.
- [x] **MUST** landing, cloud, analysis, and PNG share the same warm-paper, blue/violet/orange gradient, and static-grain visual language.
- [x] **MUST** pointer hover gives a term a restrained lift without collision; focus remains position-stable and reduced-motion removes the lift.
- [x] **MUST** labels are natural Japanese rather than raw developer terminology.
- [x] **MUST** controls are not clipped and microtext remains readable.
- [x] **MUST** analysis is reachable by ordinary downward scroll with no intermediate `分析を見る` button.
- [x] **MUST** no discovery rail or cropped representative-cloud preview appears between the 100svh cloud and analysis toolbar; their normal-flow bounds meet without overlap at short or ultrawide viewport ratios.
- [x] **MUST** the destructive clear action is absent from the primary toolbar but remains visibly available in the privacy footer with two-step confirmation.

At approximately 390 × 844:

- [x] **MUST** import and dashboard remain operable.
- [x] **MUST** a role-balanced overview shows all three regions at once and a labelled detail mode scrolls intentionally without hiding primary controls.
- [x] **MUST** the context drawer is usable and closable.

## N. Documentation

- [x] **MUST** `README.md` privacy wording matches implementation.
- [x] **MUST** `docs/ARCHITECTURE.md` explains adapters, worker, formulas, layout, dependencies, limits, and privacy boundaries.
- [x] **MUST** `docs/LIMITATIONS.md` candidly covers heuristic NLP, changing provider schemas, experimental Claude support, performance, browser constraints, and non-causality.
- [x] **MUST** `docs/EXECPLAN.md` records final progress, decisions, command evidence, visual evidence, and known gaps.

## Completion evidence

Before checking the final boxes:

1. run each required command and record its date, exit status, and noteworthy output in `docs/EXECPLAN.md`;
2. run the tested desktop and mobile browser flows;
3. inspect `artifacts/promptprint-demo.png`;
4. inspect downloaded PNG content for privacy and legibility;
5. reconcile this checklist with the implementation rather than relying on a general “tests pass” statement.
