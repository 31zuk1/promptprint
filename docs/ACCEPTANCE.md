# Promptprint PoC — Acceptance criteria

Every item marked **MUST** is part of the definition of done. A **SHOULD** item may remain incomplete only when its tradeoff is recorded in `docs/EXECPLAN.md`.

## Topic extraction rebuild regression contract (2026-09-09)

- **MUST** production analysis uses bundled Japanese morphology and contextual English POS; no heuristic-only fallback after dictionary errors. Only local/static-own-origin model assets may be loaded, never a runtime CDN or external NLP call.
- **MUST** held-out natural-language fixtures cover at least ten subject families, long observed compounds, noun modifiers/prefixes, independent component use, acknowledgments, source notation and unknown technical names. Actual source offsets and complete counts are testable.
- **MUST** large-corpus candidate pressure does not discard all noun phrases. Resource caps omit whole candidates; every displayed candidate retains its complete observed counts and positions, and limits are disclosed.

## Topic selection regression contract (2026-09-09)

- **MUST** repeated procedural prose across mixed topics does not displace actual subject terms in the default mode; generic-only input yields an explained empty visualization, not filler or an import failure.
- **MUST** meaningful short words, previously unseen topic vocabulary and recurring all-conversation themes remain eligible. No topical whitelist, external LLM or third-party runtime request; static same-origin dictionary assets are permitted.
- **MUST** exact lexical-boundary repairs retain source offsets; stopwords/hidden words/punctuation are never bridged. Keep whole compounds and independent uses, including generic-component Japanese and English technical phrases.
- **MUST** topic/broad toggles leave surviving-term DF, role/token totals/rates, bias, importance and source contexts identical. Selection scores must not become 2D size or 3D coordinates.
- **MUST** completed mode/exclusion counts accompany screen and PNG, including empty/dated results; use the same eligibility in insights/provider summaries and ordinary/private views.
- **MUST** verify desktop/mobile, 2D/3D, broad recovery, hiding, local-only storage/network/console guards and PNG privacy; keep the original exact mobile-24 semantic layout fixture and all one-sided stress cases.

## Optional 3D view regression contract (2026-09-09)

- **MUST** default 2D remains unchanged, and returning from 3D restores the same selected statistics and deterministic layout.
- **MUST** X=−bias, Y=role-balanced message incidence, Z=current filtered conversation coverage; validate hand-counted data, missing roles, zero denominators and date changes. No jitter, data-extrema scaling or semantic-distance claim.
- **MUST** all selected points, including 120 coincident points, retain exact metric coordinates and constant size. Count text-label and inherited layout omissions separately; every point remains selectable even if obscured.
- **MUST** projection is deterministic, immutable and bounded at desktop/mobile/camera extremes; axis names and meanings remain visible. Camera operations affect only projection and pause playback.
- **MUST** keyboard, pointer, selector/context/hiding, empty dates, 320/390 px layouts and current-camera aggregate-only PNG work in the same screen.
- **MUST** Web storage/network/console guards, private offline storage isolation and all original 2D/time/privacy regressions remain intact. No source acquisition, push or publication is authorized by this feature.

## Chronological preview regression contract (2026-09-09)

- **MUST** custom inclusive JST dates reject invalid/reversed bounds and distinguish unknown dates from conversation-date fallback, including epoch zero and leap days.
- **MUST** day/month window and cumulative playback preserve empty periods, clip partial calendar months and refuse more than 366 frames without truncation.
- **MUST** each frame recomputes real message denominators, shared classification and deterministic collision-free semantic placement.
- **MUST** no next request before completion plus dwell; pause/manual filters/context/export/hidden/unmount cannot leave recurring frame requests. Empty/last frames finish normally.
- **MUST** committed dates, source provenance and counts stay aligned with the cloud and PNG, including empty periods; desktop/mobile controls remain reachable and do not overlap the cloud.
- **MUST** ordinary storage/network guards and private offline restore remain intact. Synthetic tests cannot be reported as real-history validation.

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
- [x] **MUST** landing, cloud, analysis, and PNG share warm paper, plain typography, and static grain; semantic blue/violet/orange gradients belong to visualization surfaces, without decorative rainbow headline or brand rules.
- [x] **MUST** the landing is a centered single column without a permanent drop-zone frame; `デモを見る` and `ファイルを選ぶ` are stacked vertically, full-width within their action group, and at least 64 px high on desktop and mobile.
- [x] **MUST** at 1440 × 1000, 713 × 584, 1440 × 600, 390 × 844, and 320 × 800, the headline-to-privacy group is vertically centered within 1 px and text/action rows share the horizontal centerline; extremely short windows retain safe top clearance and scrollable content instead of clipping.
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

### Semantic/statistical regression acceptance — 2026-09-09

- [x] **MUST** bias-derived X displacement is bounded to 5.5% of canvas width and the entire padded user/assistant word stays on its own half. Vertical collision avoidance, shared global scaling and counted omission replace unrestricted fallback movement.
- [x] **MUST** all-one-side 40/80/120 terms in both directions remain bounded, non-overlapping and deterministic on desktop, mobile overview/detail and exported PNG; mixed-120 retention remains >=90 in the existing unit fixture.
- [x] **MUST** shared requires observations in both roles and close empirical message occurrence rates. `10/100` versus `0/4` is never shared; absent-role data is visibly comparison-insufficient.
- [x] **MUST** tooltip/context metrics show role message DF/total/rate, consistently defined token occurrence counts/totals/rates per 1,000 content tokens, and conversation coverage. No length-correction claim is made.
- [x] **MUST** compound representation uses actual positions with a documented >=80% containment threshold (at least two covered occurrences), retains independent-use candidates and leaves aggregate statistics untouched. Repeats and work-limit fallback are tested.
- [x] **MUST** meanings of X/size/Y, demo/import source, provider, observed period, conversation count, quota caveat and omission counts are always visible within the existing cloud and included in PNG.
- [x] **MUST** `pnpm check` and `pnpm e2e` pass with the existing privacy/network/console guards preserved. Final evidence: 90 unit tests and 16 Chromium E2E tests; desktop/mobile/PNG artifacts visually inspected. Only synthetic demo and export-shaped fixtures were supplied; this is not real-history validation.

### General completion procedure

Before checking the final boxes:

1. run each required command and record its date, exit status, and noteworthy output in `docs/EXECPLAN.md`;
2. run the tested desktop and mobile browser flows;
3. inspect `artifacts/promptprint-demo.png`;
4. inspect downloaded PNG content for privacy and legibility;
5. reconcile this checklist with the implementation rather than relying on a general “tests pass” statement.
