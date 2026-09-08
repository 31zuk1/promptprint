# ExecPlan: Promptprint browser-only PoC

> Status: full design remediation and the subsequent continuous-scroll correction completed at 2026-09-05 04:48 JST after a recoverable source snapshot, critical review, and final desktop/mobile/ultrawide browser validation. This document records repository reality, evidence, and remaining tradeoffs so work can resume without prior conversation context.

## Purpose and visible outcome

Promptprint is a static Japanese-first React application that turns local ChatGPT and experimental Claude exports into a role-aware lexical visualization. User-dominant terms appear on the left, shared terms in the center, and AI-dominant terms on the right. A user can run a synthetic demo, import JSON/ZIP files, filter the analysis, inspect bounded local context, review descriptive insights, hide terms, export a privacy-safe PNG, and clear all volatile data.

The completed PoC:

- needs no backend, database, account, login, API key, or runtime third-party service;
- processes imports and analysis in a dedicated browser Web Worker;
- keeps source messages only in volatile browser memory;
- uses the same normalization and analysis path for demo and imported conversations;
- exposes the required `dev`, `build`, `preview`, `typecheck`, `lint`, `test`, `e2e`, and `check` scripts;
- produces desktop, mobile, and share-image evidence under `artifacts/`.

## Repository state

Initial discovery at `2026-09-04T23:40:04+09:00` found an empty working directory with no Git metadata. At final reconciliation:

- working directory: `/Users/haramizuki/Project/uraimonitor`;
- the directory is still not a Git repository, so commit checkpoints and a literal Git-checkout operation are unavailable; a clean temporary directory containing only `package.json` and `pnpm-lock.yaml` was used for the equivalent frozen-lockfile install check;
- Node.js: `v22.13.0`;
- pnpm: `11.19.0`;
- package name/version: `promptprint@0.1.0`;
- runtime dependencies: React 19.2.8, React DOM 19.2.8, and fflate 0.8.3;
- Vite produces a static `dist/` bundle;
- `docs/reference/wordcloud-reference.jpeg` is not present. Visual review therefore used the required textual qualities in the product/acceptance documents rather than a pixel comparison.

The main implementation boundaries are:

- `src/importers/`: file detection, bounded ZIP inventory, ChatGPT current-branch parsing, experimental Claude parsing, safe diagnostics;
- `src/analysis/`: cleaning, local tokenization, phrases, role-normalized statistics, Echo rate, AI-first candidates, contexts, deterministic layout;
- `src/workers/`: typed request/response protocol and the import/analysis worker;
- `src/components/` and `src/App.tsx`: landing, progress, dashboard, filters, cloud, insights, diagnostics, focus-managed context drawer, lifecycle controls;
- `src/utils/exportPng.ts`: dedicated direct-Canvas PNG generation, abort handling, download, and object-URL tracking;
- `src/**/*.test.ts`: unit and integration fixtures;
- `e2e/promptprint.spec.ts`: Chromium end-to-end, privacy, lifecycle, race, and viewport checks.

## Final progress

- [x] 2026-09-05T04:20:00+09:00 — Implemented the accepted full design remediation: two-state cloud/analysis scene, non-obscuring actions, mobile overview/detail, persistent insight summary, typography/contrast/touch corrections, tooltip/focus refinement, brand-copy consolidation, export alignment, and specification reconciliation.
- [x] 2026-09-05T03:35:00+09:00 — Created and integrity-checked the pre-change archive `/Users/haramizuki/Project/uraimonitor-backups/promptprint-before-full-design-20260905T0335JST.tar.gz` (SHA-256 `12b186bfce353760f72723637cd7b0a1709413b05349bb211cb48ab8d1dc539b`; 105 entries; `node_modules` and `playwright-report` excluded) with adjacent recovery instructions.

- [x] 2026-09-05T00:51:00+09:00 — Static Vite/React/strict-TypeScript scaffold and all required package scripts verified.
- [x] 2026-09-05T00:51:00+09:00 — Synthetic Japanese/mixed-language demo verified through the production analysis path.
- [x] 2026-09-05T00:51:00+09:00 — Raw JSON and ZIP import verified with bounded work, a shared 20,000-conversation / 200,000-message retention budget, and safe Japanese recovery messages.
- [x] 2026-09-05T00:51:00+09:00 — ChatGPT graph parsing verified with current-branch selection, deterministic bounded fallback, disclosed candidate caps, and discarded-branch sentinel coverage through normalized output, statistics, and layout.
- [x] 2026-09-05T00:51:00+09:00 — Experimental Claude adapter verified with conservative provider detection, role/content variants, tool/control exclusion, and safe unsupported-shape diagnostics.
- [x] 2026-09-05T00:51:00+09:00 — Collision-resistant deterministic internal identities verified separately from truncated display filenames, including downstream-statistics regressions.
- [x] 2026-09-05T00:51:00+09:00 — Deterministic cleaning, tokenization, phrase extraction, message-document-frequency statistics, bias, importance, coverage, Echo rate/confidence, and conservative AI-first candidates verified.
- [x] 2026-09-05T00:51:00+09:00 — Dedicated worker, named progress, operation generations, request IDs, termination cancellation, late-file-read rejection, and stale-result protection verified.
- [x] 2026-09-05T00:51:00+09:00 — Deterministic collision-aware Mirror Cloud verified with user/shared/AI semantics, keyboard interaction, tooltip statistics, and bounded context.
- [x] 2026-09-05T00:51:00+09:00 — Provider/time/count/type/code/quote filters, stable provider choices, hidden-term recomputation, and export gating verified.
- [x] 2026-09-05T00:51:00+09:00 — Focus-trapped context drawer verified for Enter/click, highlighted matches, Escape closing, and focus restoration.
- [x] 2026-09-05T00:51:00+09:00 — Direct-Canvas PNG verified for aggregate-only content, PNG signature/download, hidden/private string guards, abort-on-clear, and object-URL revocation.
- [x] 2026-09-05T00:51:00+09:00 — Clear-data and worker-error paths verified to release visible and retained analysis state and return to a reusable landing screen.
- [x] 2026-09-05T00:52:00+09:00 — Desktop and 390 × 844 mobile flows, responsive primary controls, intentional horizontal cloud scroll, and generated screenshots inspected.
- [x] 2026-09-05T00:55:00+09:00 — README, architecture, limitations, ExecPlan, and all 89 acceptance checkboxes reconciled with implemented behavior and evidence.
- [x] 2026-09-05T00:51:00+09:00 — Final type, lint, unit, build, and E2E gates passed.

## Milestone evidence

### 1. Import and normalization

- File selection accepts multiple JSON/ZIP inputs and validates 32 files / 500 MB before reading.
- ZIP processing caps 4,096 total entries, 256 JSON entries, one inflated JSON at 64 MB, and aggregate inflated JSON at 200 MB.
- One mutable retention budget caps the complete selection at 20,000 normalized conversations and 200,000 normalized messages; it is shared across JSON files and selected ZIP entries, and later sources are skipped deterministically once exhausted.
- Likely aggregate, numbered, ChatGPT, and Claude conversation JSON filenames are all considered; long raw ZIP paths are classified before their display names are truncated, while only the safe display path is retained. Deliberately skipped JSON entries are counted and diagnosed even when shortened names collide.
- ChatGPT tests verify current-branch selection, honest disclosure when more than 5,000 fallback leaves exist, and that an abandoned sentinel never reaches normalized messages, term statistics, or layout.
- Claude fixtures cover `chat_messages`, `messages`, role variants, text blocks, conservative detection, and control/tool exclusions.
- Unsupported-shape diagnostics inspect at most 64 keys, render at most 12 allowlisted structural names, and never render arbitrary unknown key names or values.
- Internal IDs combine bounded deterministic hashing with file/entry/conversation/message ordinals; raw ZIP paths are hashed and discarded, while the separately sanitized display filename remains safe for diagnostics.
- Timestamps outside the fixed Unix-epoch-to-3000 range become unknown rather than reaching date-formatting APIs.

### 2. Analysis and layout

- Cleaned analysis text is separate from retained source context and is capped at 100,000 characters per message.
- Primary statistics use per-role message-document frequency with 0.5 smoothing; raw token count is only a stable tie breaker.
- Phrase generation is capped at 5,000 tokens per message, 20,000 candidates, and 500,000 stored occurrences.
- Context lookup searches at most 200,000 source characters and stores at most 20 excerpts of roughly 190 characters per selected term.
- Layout uses a 1,100 × 620 SVG coordinate space, deterministic script-aware width estimates, stable hashing, padded collision boxes, a 7,000-step spiral, and a deterministic fallback grid.
- Unit tests cover bias sign, Echo rate and confidence, AI-first reuse, deterministic coordinates, collision rejection, and bounds.

### 3. Interaction and lifecycle

- Playwright verifies required demo terms, keyboard-visible tooltip statistics, context highlighting, focus behavior, hidden terms, term-count filtering, data clearing, and mobile context use.
- A delayed file-read regression confirms cancellation cannot repopulate the dashboard.
- Monotonic analysis request IDs prevent an older queued filter result from replacing a newer hidden-term result or reopening PNG export early.
- A delayed Canvas callback regression confirms clear-data prevents a late download and object URL.
- Worker failures clear retained conversations/results before returning to the landing state.

### 4. Privacy and export

- No application code writes raw data to localStorage, sessionStorage, IndexedDB, cookies, service-worker caches, analytics, telemetry, or a remote API.
- End-to-end guards fail on any request outside the exact local test-server origin and collect console/page errors for covered demo and import flows.
- Browser-state assertions after both demo and private-sentinel import observe zero local/session storage items, no cookie, no IndexedDB database, no Cache API entries, and no service-worker registration.
- Export tests inspect Canvas draw strings so hidden terms, fixture titles, raw excerpts, and email addresses do not enter the share image.
- The downloaded file has the PNG signature, exceeds 10,000 bytes, uses a `promptprint-YYYY-MM-DD.png` name, and its tracked object URL is revoked.

## Decisions and tradeoffs

- 2026-09-05 — **Static browser-only runtime.** This keeps imported histories inside the browser boundary and avoids accounts, backend operations, and remote analysis.
- 2026-09-05 — **fflate for ZIP input.** It is a small bundled browser dependency with no service call. Decompression remains synchronous inside the worker and is not streaming.
- 2026-09-05 — **Current ChatGPT branch only.** A valid `current_node` wins. Missing/invalid current nodes use a deterministic, bounded leaf-path comparison and emit a warning.
- 2026-09-05 — **Conservative Claude detection.** Supported structural evidence is required and the UI labels Claude experimental; unsupported shapes expose only safe root/key metadata.
- 2026-09-05 — **Opaque deterministic internal identity.** Conversation/message IDs combine a readable safe prefix, bounded 64-bit FNV-1a hashing, and explicit source/record ordinals. This prevents long-prefix display truncation or repeated provider IDs from merging set/map keys without retaining raw ZIP paths.
- 2026-09-05 — **Role-normalized document frequency.** `(df + 0.5) / (roleMessages + 1)` avoids treating longer assistant replies as automatically more important.
- 2026-09-05 — **Deterministic estimated text boxes.** Layout uses script-aware width estimates rather than DOM/offscreen-Canvas measurement so it stays pure and worker-safe. The tested Chromium fixture has no severe overlap, but unusual fallback fonts remain a documented limitation.
- 2026-09-05 — **Worker termination for cancellation.** Synchronous parser/analysis functions do not poll a cooperative cancel token. The UI terminates the worker, invalidates operation/request generations, and ignores a non-abortable file read that resolves late.
- 2026-09-05 — **Reanalysis without reparsing.** Filter changes reuse normalized conversations, satisfying the acceptance goal of avoiding full file parsing. The current PoC structured-clones those strings back to the worker; worker-resident corpus IDs are a future optimization.
- 2026-09-05 — **Direct Canvas export.** A dedicated 2,200 × 1,340 drawing is simpler and safer than screenshotting the dashboard and cannot accidentally include an open drawer or DOM-only private text.
- 2026-09-05 — **Role-balanced mobile overview plus detailed exploration.** At 390 px the initial deterministic 24-term overview shows user/shared/AI regions together. The selected 40/60/80/120-term layout remains available in a centered horizontal detail mode with edge fades and a position indicator.

## Unexpected findings and resolutions

- The workspace was not a Git repository, so Git checkpoints were not created.
- The named visual reference image was absent. The implementation follows the specified rounded pale-gradient container, bold size variation, semantic color, and whitespace qualities; screenshots document the result.
- A delayed `File.arrayBuffer()` initially allowed cancelled input to finish later. An operation-generation guard now discards that completion, with an E2E regression.
- A hidden-term update initially left a short export race. Export is now disabled while analysis is busy, and request IDs reject older queued results; the 20,000-message race fixture covers this.
- Unsupported-shape detail initially existed only in worker diagnostics. The landing error now renders bounded safe keys without rendering raw values.
- Worker failures originally returned to landing while retaining an earlier corpus. Error paths now terminate the worker, abort export, revoke URLs, and clear conversations/results/selections.
- Clearing during Canvas encoding could have allowed a late download. Export now accepts an `AbortSignal` and has a delayed-encoding regression.
- Unbounded nested arrays, fallback branch scoring, total ZIP entry inventory, and extreme timestamps were identified during audit and received explicit fixed ceilings and tests.
- Fallback selection initially capped leaves without disclosing omissions. It now reports the exact omitted candidate count and describes selection as occurring within the first 5,000 candidates.
- A display-safe 180-character ZIP path could hide a trailing `conversations.json` or collide with another shortened path. Classification now produces a boolean from a bounded raw basename before truncation, retains no raw path, and selection/skipping uses the boolean rather than the display name.
- Conversation/message IDs originally reused 120-character display-safe slugs, so long common prefixes could merge distinct documents in downstream sets. Opaque source identity and ordinal-salted hashes now keep IDs unique and deterministic; ChatGPT/Claude tests verify exact document frequency and conversation coverage after the formerly colliding imports.
- Aggregate retention was initially per parser. One budget now spans the whole selection, stops within the current conversation, and reports dropped candidates and later sources.
- Mixed supported/unsupported files and non-selected ZIP JSON were initially underreported. Diagnostics now count and name safe skipped inputs.
- Accessibility review found several microtext colors below WCAG AA contrast; the secondary palette was darkened while preserving the visual hierarchy.
- Privacy tests initially allowed any localhost port and checked storage only after demo. They now require the exact same origin and repeat storage/Cache checks after a real-shaped import containing private sentinels.
- Mobile review found primary filters and the clear-data label too easy to lose. The final layout keeps a labelled 44px toolbar, the exact visible `解析データを消去` label, a role-balanced overview, and a separate detailed horizontal explorer.

## Validation evidence

All times below are 2026-09-05 JST. Exit status is the process result unless the command is a deliberately terminated server smoke test.

| Time | Command or check | Result | Noteworthy output / evidence |
| --- | --- | --- | --- |
| 00:14 | `pnpm install` | PASS, exit 0 | Already up to date; completed in 190 ms with pnpm 11.19.0. |
| ~00:25 | clean-directory `pnpm install --frozen-lockfile` | PASS, exit 0 | Temporary directory contained only `package.json` and `pnpm-lock.yaml`; 253 packages resolved from the store in 1 s. This is the fresh-tree equivalent available without Git metadata. |
| ~00:25 | `pnpm audit --prod` | PASS, exit 0 | No known production-dependency vulnerabilities found for the final lockfile. |
| 00:15 | `pnpm dev --host 127.0.0.1 --port 4199 --strictPort` + HTTP probe | PASS | Vite 8.2.2 ready in 103 ms; `/` returned HTTP 200; server then stopped intentionally. |
| 04:21 | `pnpm preview --host 127.0.0.1 --port 4180 --strictPort` + HTTP probe | PASS | Fresh final static preview returned HTTP 200; server then stopped intentionally. |
| 04:47 | `pnpm typecheck` (through final `pnpm check`) | PASS, exit 0 | `tsc -b --pretty false`. |
| 04:47 | `pnpm lint` (through final `pnpm check`) | PASS, exit 0 | `eslint . --max-warnings 0`; no warnings. |
| 04:47 | `pnpm test` (through final `pnpm check`) | PASS, exit 0 | Vitest: 10 files, 61 tests passed. |
| 04:47 | `pnpm build` (through final `pnpm check`) | PASS, exit 0 | Vite 8.2.2; 36 modules; `dist/index.html` 0.67 kB (gzip 0.44), worker 53.85 kB, CSS 32.91 kB (gzip 7.01), app JS 243.68 kB (gzip 77.70). |
| 04:48 | final `pnpm check` + artifact-generating `pnpm e2e` | PASS, exit 0 | Typecheck, zero-warning lint, 61 unit tests, production build, and Chromium 9/9 all passed; final E2E completed in 14.9 s. |
| 00:52 | production bundle URL/telemetry inspection | PASS | No analytics, telemetry, remote-font, runtime-CDN, or third-party API strings; only standards namespace URIs and React's inert error-help URL were present. |
| 04:46 | desktop and ultrawide flow inspection | PASS | At 1,710 × 978 the cloud occupies exactly one viewport and analysis begins at y=978. After ordinary scroll, `analysisTop=0`, `openingBottom=0`, `toolbarTop=0`, and the cropped-preview count is zero. Standard 1,440 × 1,000 also shows clean independent frames. |
| 04:21 | exported PNG inspection | PASS | 2,200 × 1,340 and 1,335,490 bytes: canonical tagline, cloud, legend, aggregate counts, and date range are legible; no raw excerpt/title/email is visible. |
| 04:46 | mobile screenshot and flow | PASS | At 390 × 844 the cloud height is exactly 844px and analysis begins at y=844. The full-page artifact is 390 × 2,148; overview/detail, ordinary analysis scrolling, filters, controls, and context drawer remain operable. |
| 04:19 | three-agent visual vote before owner screenshot | INCOMPLETE | Reviewers found the component-level refinements acceptable but incorrectly treated the consecutive boundary rows as P2. The 04:30 owner screenshot demonstrated a blocking structural defect; the 04:35 exclusivity regression supersedes this vote. |
| 00:54 | independent acceptance re-audit | PASS | Acceptance A–N all passed with no remaining MUST blocker; prior long-prefix identity collision is covered through downstream counts. |

### Artifact inventory

| Artifact | Dimensions | Size | Purpose |
| --- | ---: | ---: | --- |
| `artifacts/promptprint-demo.png` | 1,440 × 1,000 | 457,155 bytes | canonical full-screen Mirror Cloud opening |
| `artifacts/promptprint-demo-full.png` | 1,440 × 1,000 | 100,835 bytes | clean desktop analysis viewport without a cloud preview strip |
| `artifacts/promptprint-ultrawide-analysis.png` | 1,710 × 978 | 102,672 bytes | clean analysis at the latest owner-reported Retina screenshot ratio |
| `artifacts/promptprint-export.png` | 2,200 × 1,340 | 1,335,490 bytes | downloaded privacy-safe share card |
| `artifacts/promptprint-mobile.png` | 390 × 2,148 | 233,180 bytes | continuous mobile cloud-to-analysis page from a 390 × 844 viewport |
| `artifacts/promptprint-landing.png` | 1,440 × 1,323 | 113,010 bytes | landing/import state |

## Acceptance reconciliation

| Section | Status | Evidence summary |
| --- | --- | --- |
| A — repository/startup | PASS with repository caveat | Clean-directory frozen-lockfile install, dev, preview, and static build pass; no backend/env secret. Git checkout itself is unavailable because this workspace has no Git metadata. |
| B — empty/demo | PASS | Landing and one-click demo are covered; required semantic sides and terms are asserted. |
| C — ChatGPT | PASS | JSON/ZIP, graph branch, exclusion, diagnostics, order/timestamp, and sentinel tests. |
| D — Claude | PASS within experimental scope | Representative variants and safe unsupported diagnostics are covered and visibly labeled experimental. |
| E — analysis | PASS | Pure-function tests cover cleaning, local deterministic analysis, statistics, phrases, Echo/confidence, and AI-first behavior. |
| F — Mirror Cloud | PASS | Deterministic collision/bounds tests, desktop review, tooltip/context UI, and keyboard/focus E2E. |
| G — filters | PASS; optimization tradeoff recorded | Required controls and hidden-term behavior pass; files are not reparsed, though normalized strings are cloned for reanalysis. |
| H — insights | PASS | Three term groups, Echo caveat/confidence, non-causal AI-first, and conditional user-specific provider comparison. |
| I — privacy/lifecycle | PASS for tested browser flows | Local-only architecture, storage/network guards, clear/error cleanup, export-string privacy, URL lifecycle, and late-operation tests. |
| J — PNG | PASS | Valid non-empty named PNG, required aggregate content, hidden/private string exclusion, and visual inspection. |
| K — errors/cancellation | PASS | Unit input failures plus malformed/unsupported browser recovery, honest mixed-file diagnostics, delayed-read cancellation, and reusable landing. |
| L — tests/evidence | PASS | Final check passes; 61 unit tests and 9 Chromium E2E tests; screenshots, tooltip assertion, exact-origin network guard, storage/Cache checks, ultrawide state-exclusivity regression, and console guards exist. |
| M — visual review | PASS for acceptance viewports | Desktop and mobile artifacts inspected; mobile uses a role-balanced overview plus an explicit detailed horizontal explorer, and primary controls remain visible. |
| N — documentation | PASS | README, architecture, limitations, and this plan reflect implemented behavior, limits, evidence, and known gaps. |

## Known gaps and non-blocking limitations

- A literal Git checkout cannot be created from this directory because there is no `.git` history. A clean-directory frozen-lockfile install from only the two package manifests passes, but repository transport and commit history remain outside this PoC.
- The requested `docs/reference/wordcloud-reference.jpeg` was never available, so only the written reference qualities were reviewed.
- Claude support is fixture-backed and explicitly experimental; provider export evolution can require new bounded adapters.
- The 10,000-conversation / 20,000-short-message E2E protects request ordering but is not a representative long-message, deep-graph, or large-ZIP benchmark.
- The 200 MB inflated JSON ceiling applies to each ZIP, not cumulatively across all selected archives. Normalized retention has a shared aggregate ceiling, but rejected candidate records consume bounded per-parser work rather than one selection-wide attempted-record budget; adversarial multi-file inputs can therefore require more CPU/inflation work than retained counts suggest.
- Chromium is the only automated browser. Safari and Firefox rely on the documented browser APIs and have not received equivalent regression runs.
- Layout collision boxes use deterministic character-width estimates rather than exact browser glyph measurement. Unusual fonts or scripts can differ from the model.
- Filter reanalysis structured-clones normalized source strings. A worker-resident corpus keyed by IDs would reduce peak memory for very large imports.
- Cancellation relies on worker termination and operation invalidation rather than checkpoints inside one synchronous decompression/analysis call.
- Empty/oversized ZIP cases and active-branch sentinel propagation are covered in unit tests rather than duplicated in Playwright. Tooltip statistics are directly asserted in the keyboard-focus browser flow.

## Recovery and resume instructions

1. Work from `/Users/haramizuki/Project/uraimonitor` and read `AGENTS.md`, `docs/PRODUCT_SPEC.md`, `docs/TECHNICAL_SPEC.md`, and `docs/ACCEPTANCE.md` before changing behavior.
2. Run `pnpm install`, then `pnpm check` and `pnpm e2e`. `pnpm check` intentionally does not include E2E.
3. Use `pnpm dev` for development and `pnpm preview` after `pnpm build` to inspect the static artifact.
4. Inspect `artifacts/promptprint-demo.png`, `artifacts/promptprint-mobile.png`, and `artifacts/promptprint-export.png` after visual/export changes.
5. When adding a provider shape, keep input typed as `unknown`, extend bounded fixtures, and ensure diagnostics contain safe metadata rather than private values.
6. When changing limits, update UI messages, `README.md`, `docs/ARCHITECTURE.md`, `docs/LIMITATIONS.md`, tests, and this plan together.
7. Because no Git metadata exists, preserve unrelated files carefully and arrange repository initialization/checkpoint policy with the owner before relying on Git workflows.
8. To restore the exact pre-remediation design, move the current project aside, extract `/Users/haramizuki/Project/uraimonitor-backups/promptprint-before-full-design-20260905T0335JST.tar.gz` from `/Users/haramizuki/Project`, and run `pnpm install --frozen-lockfile`. The archive SHA-256 is `12b186bfce353760f72723637cd7b0a1709413b05349bb211cb48ab8d1dc539b`; do not extract over work that still needs to be preserved.

## Addendum: visual design refresh (2026-09-05)

The owner requested a full visual redesign of the landing, progress, and dashboard surfaces ("catastrophic design" concern; direction chosen: refresh, not incremental polish). Live inspection of the running app (not just `artifacts/` screenshots) found the prior design functionally solid but visually generic and internally inconsistent:

- base type scale bottomed out at `.68rem` (≈11px) across dozens of labels, hurting legibility;
- four stat cards used four unrelated pastel accent colors with no semantic tie to the product;
- chrome accent colors (`#2778cf` / `#7c4acb` / `#dd6b34`) did not match the exact hues the Mirror Cloud/PNG export compute (`src/analysis/colors.ts`: `#2563EB` / `#7C3AED` / `#C2410C`);
- nearly every section used the same soft-shadow rounded-card treatment (generic "AI SaaS" language: blurred gradient blobs, heavy `backdrop-filter`), so the Mirror Cloud — the actual product output — did not stand out from decorative chrome;
- the brand mark was three overlapping blurred color blobs unrelated to the "mirror" concept.

Changes made, CSS-only plus one presentational component:

- rewrote `src/styles/app.css` around an editorial/print direction (fits the "Promptprint" name): warm paper background, hairline-rule sectioning for secondary data (stats strip, insight grid, how-it-works triptych) instead of stacking rounded shadow cards everywhere, the Mirror Cloud reframed with a heavier ink border like a printed plate, and chrome accent colors aligned exactly to `USER_COLOR`/`SHARED_COLOR`/`ASSISTANT_COLOR` in `src/analysis/colors.ts`. Base font sizes raised off the sub-12px floor throughout.
- `src/components/Brand.tsx`: mark replaced with a two-tone mirrored diamond (user-blue / AI-rust split) tying directly to the product concept.
- No changes to component logic, `data-testid`, `role`/`aria-*` attributes, worker protocol, or `src/analysis/colors.ts` / `src/utils/exportPng.ts` — the PNG export already used the correct semantic hex values, so it needed no change.

Validation: `pnpm check` (typecheck, lint, 58 unit tests, build) and `pnpm e2e` (8 Chromium tests, including the mobile-viewport flow and the storage/network/console privacy guards) pass unchanged after the redesign. `artifacts/promptprint-{landing,demo,demo-full,mobile,export}.png` were regenerated by the same `pnpm e2e` run.

### Follow-up: minimal monochrome pass (2026-09-05, same day)

The owner viewed the refresh above live (after ruling out a browser-cache false negative) and rejected it as still not minimal enough, directing a second pass toward "圧倒的にミニマル" (aggressively minimal).

`src/styles/app.css` was rewritten again around one rule: **color is reserved for what the analyzed data actually means, and never used for chrome/branding/decoration.** Concretely:

- background is pure white, text is black/grey only; every `box-shadow` and `backdrop-filter` removed (fully flat, border-only elevation);
- the gradient hero/dashboard headline text was replaced with solid black + a bottom-border underline on the emphasized phrase;
- `--user`/`--ai`/`--shared`/`--good`/`--warn`/`--bad` (still matching `src/analysis/colors.ts` exactly) now appear **only** where they encode real user/AI/shared/echo meaning: the Mirror Cloud, its legend, insight-card kickers/icons (now an 8px dot instead of a tinted icon tile), the context drawer's bias pill/role dot, and the echo-meter arc. Stat-card numbers, buttons, badges, tags, and the progress-page loader dots (aside from 3 small preview dots) are grayscale;
- large border-radius and pastel-filled pill badges (`実験的対応`, `実験的`, term chips, adoption terms) were replaced with square-ish 1px-bordered tags;
- `src/components/Brand.tsx`: the mark span was removed entirely — the brand is a plain black wordmark now, no icon/logomark.

Validation repeated after this pass: `pnpm check` (58 unit tests, build) and `pnpm e2e` (8 Chromium tests) both pass unchanged; `artifacts/` screenshots regenerated again.

### Follow-up: full-bleed Mirror Cloud hero, dashboard moved below the fold (2026-09-05, same day)

The owner judged the monochrome pass "better but tasteless" and specifically objected to the Mirror Cloud sitting inside a bordered card. Direction: the word field should be dynamic and fill the screen on landing in the dashboard, with the descriptive/analysis dashboard (stats, filters, insights — "minimal, hover-driven UI") revealed only on scroll.

Structural changes (not CSS-only this time):

- `src/App.tsx`: `<MirrorCloud>` moved to render immediately after `<header className="dashboard__header">`, ahead of `dashboard__intro`/`StatsCards`/`FilterBar`/`InsightCards`, which now form the "scroll down" dashboard.
- `src/components/MirrorCloud.tsx`: restructured from a bordered `.cloud-card` into a full-bleed `.cloud-hero` section (`display:flex; flex-direction:column; min-height:calc(100vh - header height)`), with the heading/legend as an overlay row and the SVG canvas (`.cloud-canvas`, still carrying `data-testid="mirror-cloud"`) filling the remaining height edge-to-edge, no border. Because the canvas's aspect ratio is no longer locked to the SVG's `1100×620` viewBox (it used to be, via `aspect-ratio: 1100/620` on the card), the old tooltip-positioning approach — deriving screen position directly from raw viewBox coordinates (`hovered.x / 11`, `hovered.y / 6.2`) — would misplace the tooltip. Replaced it with `getBoundingClientRect()`-based measurement of the hovered/focused `<g>` relative to the canvas container, taken at hover/focus time; this is correct regardless of container aspect ratio or SVG letterboxing (`preserveAspectRatio="xMidYMid meet"`, made explicit).
- `src/styles/app.css`: `.cloud-section`/`.cloud-heading`/`.cloud-card` replaced with `.cloud-hero`/`.cloud-hero__top`/`.cloud-canvas`; the axis/legend/hint rules retargeted at the new structure. Mobile keeps the existing intentional horizontal-scroll behavior for the word field (fixed 690px inner width) but drops the fixed card aspect ratio in favor of a fixed `min-height`.

`data-testid="mirror-cloud"` and the `.mirror-cloud` SVG class were preserved on their (repositioned) elements, so no test selectors changed. Validation: `pnpm check` (58 unit tests, build) and `pnpm e2e` (8 Chromium tests, including the tooltip-content assertion and the mobile-viewport flow) pass unchanged; `artifacts/` screenshots regenerated again.

### Follow-up: pinned background, header removed, frosted scroll-over dashboard (2026-09-05, same day)

Owner direction: no header bar at all, no "YOUR MIRROR CLOUD / 言葉の重心" heading over the diagram, the diagram should fill the very top of the screen on open, and scrolling should bring the dashboard up as a translucent, blurred panel sliding over the diagram — with a soft (not hard-edged) transition, so the diagram looks like it's fading/blurring even slightly beyond where the panel visually starts.

- `src/components/MirrorCloud.tsx`: removed the `.cloud-hero__top` heading/legend block entirely; the section now carries its accessible name via `aria-label` directly (`aria-label="言葉の重心 — あなたとAIの語彙分布"`) instead of `aria-labelledby` on a visible `<h2>`.
- `src/styles/app.css`:
  - `.cloud-hero` is now `position: fixed; inset: 0; z-index: 0` — a pinned, full-viewport background layer (previously a normal-flow full-bleed section). It no longer varies by breakpoint (`min-height` hacks removed) since `inset: 0` covers any viewport size uniformly.
  - `.dashboard__header` is `position: fixed` at `z-index: 30` with `pointer-events: none` and only its direct children re-enabling `pointer-events: auto`, so it no longer reserves layout height (the diagram is not pushed down) or blocks clicks on the diagram between its controls. It has no solid background — a `backdrop-filter: blur(10px)` + gradient (opaque at top, fading to transparent by ~55–100px down) plus a matching `mask-image` keep the brand/privacy/export/clear controls legible over the busy word field without reading as a bar.
  - New `.dashboard__scroll` wrapper (added around everything from `dashboard__intro` through the footer in `src/App.tsx`) sits after `.cloud-hero` in normal document flow with `margin-top: 100vh`, so the first full viewport is the diagram alone. It has `z-index: 10` and a translucent, heavily blurred background (`rgba(255,255,255,.92)` + `backdrop-filter: blur(32px)`), and an `::before` pseudo-element extending 180px above its own top edge with a gradient+masked blur, so the diagram softens gradually rather than being cut off by a hard line as the panel scrolls up over it.
  - Because the diagram is a fixed background instead of a normal-flow section, `.dashboard__scroll` scrolling to fully cover the viewport is expected to make the pinned words behind it inert (exactly like any opaque overlay) — this is inherent to the requested effect, not a bug.
- `e2e/promptprint.spec.ts` (mobile viewport test): the "単語のみ" filter click used to happen *before* the Mirror Cloud word/drawer interaction; once the fixed-background pattern was in place this caused Playwright to scroll the page down to reach the filter control first, after which the dashboard panel covered the pinned cloud and the follow-up click on "ロボット" failed with a pointer-event-intercepted error — a real, expected consequence of the new layout, not a flake. Reordered the test to interact with the cloud/drawer first (while nothing has scrolled over it yet), then the filter — same assertions, order matches how a person would actually use the page.

Validation: `pnpm check` (58 unit tests, build) and `pnpm e2e` (8 Chromium tests) pass. `artifacts/` screenshots regenerated; note that `promptprint-demo-full.png`/`promptprint-mobile.png` (Playwright `fullPage` screenshots) render `position: fixed` content only once, at the top, since a single flattened image cannot represent a pinned-background/scroll-parallax effect — this is a known screenshot-tooling limitation, not an app defect. The live scroll-parallax behavior was verified interactively instead.

### Follow-up: header moved off-screen, softer seam, dashboard folded into a smaller accordion panel (2026-09-05, same day)

Owner pushed back again: the floating top vignette still read as "a header" and had to go entirely (brand/privacy/export/clear controls moved off the top), the diagram/dashboard seam was still too sharp, and the dashboard itself should be smaller and use a collapsible ("折り畳み") structure instead of one long scroll.

- `src/styles/app.css` — `.dashboard__header`: flipped from `top:0` to `bottom:0` (gradient/mask direction flipped to match), so nothing at all sits over the diagram at the top; it's a floating strip pinned to the bottom of the viewport instead, still `pointer-events:none` on the container with `auto` re-enabled on its direct children.
- Seam softening: `.dashboard__scroll` gained a second pseudo-element. It now has two stacked fade layers instead of one — `::before` (560px tall, faint `blur(9px)`, mask ramping 0→65% opacity) sits further out for a long, barely-there haze, and `::after` (240px tall, `blur(32px)`, mask 0→100%) is the stronger near-panel transition — approximating a progressive blur that CSS can't do in one layer, so the diagram softens gradually well before the panel's solid edge instead of cutting off sharply.
- "Smaller, foldable dashboard": `.dashboard__scroll` is no longer a full-bleed sheet — it's now a centered card (`width: min(1180px, calc(100% - 64px))`), rounded on top only, bordered, with its own shadow, so the pinned diagram is still visible at the sides even once the panel is in view. `FilterBar` and `InsightCards` (the two bulkiest sections) are now wrapped in native `<details class="dash-fold">` accordions in `src/App.tsx`, collapsed by default, with a `<summary>` + chevron toggle (new `.dash-fold`/`.dash-fold__chevron` CSS). `StatsCards`, the method note, and the footer stay always visible since they're already compact. `DiagnosticsPanel` was already a `<details>` and needed no change.
- `e2e/promptprint.spec.ts` — three real, expected consequences of the above needed fixing, not flakes:
  1. `<summary>` exposes accessibility role `"generic"` in this Chromium build, not `"button"` — `getByRole('button', { name: 'フィルター' })` never resolved (confirmed via the Playwright ARIA-snapshot error context). Switched every such locator to `getByText('フィルター', { exact: true })`, which the native `<summary>` click-to-toggle behavior handles the same way regardless of which descendant text is clicked.
  2. The mobile test's visibility assertions for the filter controls (`単語のみ`, `コードを除外`, `引用を除外`) had to move to after opening the フィルター accordion, since those controls are no longer rendered-visible until expanded.
  3. In the 10,000-conversation race test, opening the フィルター accordion to change `表示する語` scrolls the page down (same pinned-background occlusion as the earlier mobile-test fix), but this test's intent specifically requires filtering *then* clicking the resulting term — reordering wasn't an option here. Added an explicit `window.scrollTo(0, 0)` after the filter interaction and before clicking the cloud word, restoring the diagram to view before interacting with it again.

Validation: `pnpm check` (58 unit tests, build) and `pnpm e2e` (8 Chromium tests) pass.

### Design critique and agent debate (2026-09-05)

No implementation code changed in this review. The current landing, demo cloud, hover tooltip, scroll transition, collapsed/expanded dashboard, context drawer, and 390 × 844 responsive states were inspected live. Three independent reviewers covered art direction and motion, typography and UI craft, and product UX and brand. Their first reviews were cross-examined in a second round, followed by a forced-choice final vote on the two unresolved interaction proposals.

Observed evidence:

- The 1,440 × 1,000 initial Mirror Cloud is the strongest current frame: term scale and the user/shared/AI color semantics read immediately.
- At approximately `scrollY = 657`, the 1,180 px panel and its 560 px + 240 px blur layers read as a milky rectangle; at the settled panel position, large word fragments remain visible in the side gutters.
- The fixed action layer is 104 px high on desktop and 86 px on mobile. It covers cloud/dashboard content in every state. At 390 px it reduces privacy to an unexplained 22 px green-dot square and PNG export to an icon-only control.
- The mobile SVG remains 690 px wide. Its initial 390 px viewport shows the user side, while the AI side is off-screen; the top axis label also meets the viewport edge. This prevents the product's three-way comparison from being understood before interaction.
- The dashboard hides both filters and primary insights by default. Opening the insight fold repeats the same title in the summary and content. Opening a native summary produces a visually heavy double border because the global focus ring stacks with the existing border.
- Readable information still uses `.68rem`–`.74rem` (10.88–11.84 px) in many places. `--ink-faint: #9a9a9a` has approximately 2.81:1 contrast on white, and `--line-strong: #cfcfcf` has approximately 1.56:1, contradicting the earlier claim that the sub-12 px floor and accessibility issue had been removed.
- The black tooltip obscures a substantial part of large terms, while hover reduces the selected term to `.78` opacity. The visual feedback therefore weakens and covers the object being inspected.
- The context drawer, semantic three-color mapping, stats strip, primary landing CTA, and privacy-safe PNG composition remain the strongest patterns to preserve.

Debate decisions:

1. **Mobile target, unanimous:** show a deterministic role-balanced overview of about 24 top terms with user/shared/AI visible together, then expose the selected 40/60/80/120-term result as a detailed horizontal exploration view. Centered initial horizontal scroll with edge fades and a position indicator is a useful interim patch and remains appropriate for the detail view, but is not the final overview.
2. **Scroll behavior, 2–1 decision:** replace continuous scroll-linked blur/scale with two explicit states: a full-screen cloud and an analysis state with a reduced non-obscuring preview. A short opacity transition is acceptable; reduced-motion uses an immediate switch. This is more predictable across browsers and avoids moving focus targets.
3. **Actions:** remove the permanent bottom overlay. Keep visible privacy/export/clear controls in a labelled, safe-area-aware toolbar associated with the analysis panel. The initial scene gets one clear `分析を見る ↓` action rather than a competing utility dock.
4. **Insights:** keep a compact summary visible without interaction (top user/shared/AI terms and Echo rate), with only details folded. Filters may remain collapsed.
5. **Brand:** keep color reserved for data meaning, but unify the competing `fingerprint` / `portrait` / `景色` / `mirror` metaphors around `言葉の指紋`; Mirror Cloud becomes the visualization name rather than a competing brand idea.

Recommended implementation order:

1. Raise information text to at least 13 px, darken faint text, separate decorative from interactive border tokens, and bring touch targets to at least 44 px.
2. Move the fixed actions into a labelled panel toolbar, add safe-area and scroll-padding handling, and remove content overlap.
3. Replace the current long double-blur transition with the two-state full-cloud/analysis scene while keeping filter results visible during exploration.
4. Add the deterministic mobile overview/detail modes, with only one interactive cloud in the accessibility tree at a time.
5. Add a persistent insight summary, remove duplicate headings and excess English kickers, unify the product metaphor, and align app/export visual tokens.

Validation for this review was visual and read-only; no build or test result is newly claimed. Any implementation of these recommendations must rerun `pnpm check`, `pnpm e2e`, the 1,440 × 1,000 and 390 × 844 flows, keyboard focus/return checks, unexpected-network and console guards, and regenerate the screenshot artifacts.

### Final implementation of the critique decisions (2026-09-05, 04:20 JST)

All five debate decisions above were implemented and reviewed in the live app:

- The opening is now an explicit full-screen Mirror Cloud state. A separate discovery rail leads to the analysis state, whose opaque sticky toolbar never overlays data. The reduced desktop preview and direct mobile analysis entry preserve orientation without repeating the full scene.
- The mobile default is a deterministic 24-term SVG overview with user/shared/AI quotas, semantic x-bands, staggered placement, and a 13–22 px range. A separate detail view exposes the selected 40/60/80/120-term cloud, starts centered, and supplies edge fades plus a live left/center/right indicator.
- The always-visible analysis summary exposes the strongest user/shared/AI terms and neutral Echo rate. Filters, diagnostics, and detailed insights remain foldable; summary terms open context directly.
- Typography is limited to 400/600/700/800 weights, information text has a 13 px floor, faint text is darker, interactive borders are distinct, Japanese headings use restrained tracking, and all primary/touch actions are at least 44 px. Summary cards use an 8 px radius, the drawer uses `100dvh` plus safe-area padding, and context text is 15 px at 1.7 line height.
- Tooltip placement now measures actual target edges and selects a collision-safe side; the selected term stays fully opaque while surrounding terms recede. Transparent SVG hit rectangles provide approximately 44 px physical targets and an explicit keyboard focus ring.
- Product copy is unified around `言葉の指紋`; English decorative kickers were removed where redundant. Privacy uses a lock plus concrete local-memory text rather than a green status dot. Echo styling is neutral, and user/shared/AI colors are reserved for lexical meaning.
- PNG export uses the same paper, semantic colors, weight scale, geometry, Japanese privacy line, and canonical tagline as the app. Raw excerpts, titles, emails, and hidden terms remain excluded.
- `docs/PRODUCT_SPEC.md`, `docs/TECHNICAL_SPEC.md`, `docs/ACCEPTANCE.md`, `README.md`, unit coverage, and E2E selectors/assertions were reconciled with the new interaction model.

Final reviewer verdicts were unanimous **GO**. The macro reviewer found the desktop and mobile proportions release-ready, with only a non-blocking observation that the discovery rail and analysis toolbar appear consecutively in the full-page capture while carrying distinct content. The micro-UI reviewer measured a 12 px tooltip gap and 0 px overlap, and verified focus, 44 px targets, mobile three-region visibility, drawer sizing, and text rhythm. The UX/brand reviewer found the disclosure order, privacy language, neutral statistics, semantic colors, and non-diagnostic phrasing coherent. Its only P2 copy note was resolved by matching the PNG title to the canonical tagline.

Validation after that copy change: `pnpm check && pnpm e2e` passed at 04:21 JST — 10 Vitest files / 61 tests, zero-warning ESLint, strict TypeScript, a 36-module production build, and the then-current 8/8 Chromium tests in 12.0 seconds. The E2E suite regenerated all five artifacts and retained the exact-origin network and browser-console error guards. Development and production-preview HTTP probes both returned 200.

### Correction: opening/analysis state stacking (2026-09-05, 04:35 JST)

The owner supplied a 3,420 × 1,382 screenshot showing a real visual defect: near the vertical transition, the opening discovery rail, analysis toolbar, full cloud, and representative cloud were all visible at once. The earlier review incorrectly classified the consecutive rows as non-blocking. DOM inspection confirmed this was structural, not a screenshot artifact: both states were always mounted and an `IntersectionObserver` only changed their opacity/phase label, while `scrollIntoView({ behavior: 'smooth' })` exposed the seam.

Resolution:

- `src/App.tsx` now renders the opening and analysis screens as mutually exclusive React branches. `分析を見る` switches directly to analysis, `クラウド全体を見る` switches back, and an effect resets the page to `scrollY = 0` on every switch.
- The scroll observer, cross-state scaling, and smooth stacked-page behavior were removed. A short opacity entrance remains and reduced-motion continues to collapse transition duration.
- E2E helpers now enter analysis explicitly before using filters/export/clear. Artifacts separately represent the opening and analysis state instead of flattening both into one misleading page.
- A dedicated 1,710 × 691 CSS-pixel regression reproduces the supplied Retina screenshot's ultrawide ratio. It asserts that opening has one discovery rail and no toolbar/preview, while analysis has one toolbar/preview and no opening/rail; it also verifies the return transition and `scrollY = 0`.

Final evidence at 04:35 JST: live browser inspection at 1,440 × 1,000 and 1,710 × 691 showed clean, single-state frames; measured DOM counts were opening `{ opening: 1, toolbar: 0, rail: 1 }` and analysis `{ opening: 0, toolbar: 1, rail: 0 }`. `pnpm check` passed with 61/61 unit tests and the final artifact-generating `pnpm e2e` rerun passed 9/9 Chromium tests in 12.5 seconds, including the exact-origin network and browser-console guards.

### Correction: continuous access and cropped preview removal (2026-09-05, 04:48 JST)

The owner then supplied a 3,420 × 1,956 screenshot and identified two usability defects in the mutually exclusive fix: analysis required an unnecessary `分析を見る` click, and the small representative cloud above the analysis content read as a large diagram cut off by the viewport. That feedback supersedes the 04:35 branch-switch design.

Final resolution:

- The dashboard is one continuous document again, but without the earlier problematic seam: a cloud-only `100svh` opening is followed directly by the analysis section in normal flow. The analysis is always present below and needs only an ordinary downward scroll.
- The discovery rail, `分析を見る` button, state-switching observer/state, and representative preview are removed. No partial second diagram can appear above the analysis heading.
- The analysis toolbar remains white, opaque, and sticky only when its section reaches the viewport. `クラウド全体を見る` performs a return scroll; reduced-motion users receive an immediate rather than smooth return.
- The cloud's 13px bottom hint now combines the local-only privacy promise with a non-interactive downward-scroll cue. It stays inside the fixed `100svh` composition and respects the bottom safe area without becoming another rail.
- The ultrawide regression now uses the latest screenshot's 1,710 × 978 CSS-pixel size. It verifies no `分析を見る`, no discovery rail, no `.analysis-preview`, a ≤1px normal-flow boundary difference, a sticky toolbar at y=0 after scroll, and return-to-top behavior.

Live measurements at 1,710 × 978 were `openingHeight=978`, initial `analysisTop=978`, and after scroll `analysisTop=0`, `openingBottom=0`, `toolbarTop=0`, `previewCount=0`. At 390 × 844 they were `openingHeight=844`, initial `analysisTop=844`, and `previewCount=0`. Visual inspection showed a complete cloud frame followed by a clean analysis heading with no diagram fragment. Final `pnpm check` passed with 61/61 unit tests; the artifact-generating `pnpm e2e` rerun passed 9/9 Chromium tests in 14.9 seconds, including the network and browser-console guards.

### Unified Chromatic Print pass (2026-09-05, 05:03 JST)

The owner requested one coherent design language across file import, the full cloud, analysis, and PNG: several restrained colors, shared noise/gradient treatment, and a slight lift when pointing at a word. Three specialist reviewers independently covered macro composition, micro typography/controls/motion, and UX/brand/privacy. Their converged direction was implemented as `Chromatic Print`:

- a warm `#FCFAF6` paper base, one semantic blue → violet → orange spectrum (`#EDF5FF → #F7F2FF → #FFF0E7`), and one non-animated local SVG grain layer with fixed seed 17;
- a desktop two-column landing composition that keeps the value proposition and import decision visually balanced, collapses to a complete 390 px single-column first viewport, and uses the same spectrum only as thin identity rules and a restrained import field;
- a spectrum-led full-screen cloud, a much quieter paper analysis surface, and one colored analysis-summary field instead of unrelated tinted cards;
- SVG term hover constrained to `translateY(-2px) scale(1.015)` plus a 16% drop shadow, with surrounding terms at `.44` opacity. Keyboard focus remains position-stable, and reduced-motion disables transforms/filters;
- a Canvas-generated PNG rebuilt with the same paper, gradient, border radius, semantic colors, identity rule, and deterministic grain. It continues to draw aggregate terms only and never rasterizes the application DOM;
- the owner asked to omit data clearing entirely, but repository privacy requirements in `AGENTS.md`, `PRODUCT_SPEC.md`, and acceptance criterion I require a visible clear action. The action was therefore removed from the primary sticky toolbar and demoted to a quiet, always-visible privacy-footer control while preserving two-step confirmation and all cancellation/object-URL cleanup behavior.

Live QA found and fixed one desktop headline wrap (`AIとの会話から、` splitting before its final kana) and one mobile body-copy orphan. A final micro review also caught two 320 px-only defects: the header identity/privacy labels could collide, and the terminal `へ` in the how-it-works heading could wrap alone. At `max-width: 360px` the visible badge now shortens to `端末内のみ` while retaining its complete accessible label and the full decision-point privacy sentence below; the heading is split at a semantic boundary, and the footer becomes a clean vertical stack. At 320 × 800 the document `scrollWidth` equaled 320 px, and the measured brand/badge gap was 51.08 px. Final browser measurements showed no horizontal overflow at 390 × 844 or 1,710 × 978; the opening/analysis boundary remained exact (`844 → 844` and `978 → 978` respectively), the analysis toolbar stayed at y=0 only after the analysis section reached it, and `.cloud-hero--preview` remained absent. At 1,440 × 1,000 the term-hover computed style was `matrix(1.015, 0, 0, 1.015, 0, -2)` with the intended drop shadow.

Validation completed at 05:02–05:08 JST:

- `pnpm check`: PASS — strict TypeScript, zero-warning ESLint, 10 Vitest files / 61 tests, and 36-module production build. The final rerun after the 320 px remediation produced CSS 37.63 kB (8.35 kB gzip), app JS 244.60 kB (78.03 kB gzip), and worker 53.85 kB.
- `pnpm e2e`: PASS — final artifact-generating rerun passed 9/9 Chromium tests in 16.4 seconds, including exact-origin network, console-error, volatile-storage, import recovery, cancellation races, export privacy, ultrawide-boundary, and mobile-drawer guards.
- regenerated and inspected `artifacts/promptprint-landing.png`, `promptprint-demo.png`, `promptprint-demo-full.png`, `promptprint-mobile.png`, `promptprint-ultrawide-analysis.png`, and `promptprint-export.png` (2,200 × 1,340). The export is legible and contains no raw excerpts, titles, email addresses, or hidden terms.
