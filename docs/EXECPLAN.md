# ExecPlan: Promptprint browser-only PoC

## Source checkpoint authorization — 2026-09-10

After the extraction rebuild and its validation report, the owner explicitly authorized committing and pushing the current work. This authorization supersedes the earlier no-push restriction for this source checkpoint only. Destination: the existing `origin` at `31zuk1/promptprint`, current branch `private/no-export-20260909`; do not merge into or overwrite `main`. Include implementation, documentation, tests and synthetic evidence only. Actual histories, authentication state, private images, local profiles and verification reports remain outside Git. Extension-store publication, releases, deployments and real-data uploads remain outside scope.

## Topic extraction rebuild — 2026-09-09–10 (completed implementation and validation)

The owner's real-history review rejects the heuristic selection quality. Earlier synthetic passes are not evidence of useful real-topic extraction. Replace the default extraction foundation with locally bundled morphology and observed noun phrases, then rank using conversation-level evidence. No external LLM, runtime CDN, source-acquisition restart, publication or push. Existing private storage and ordinary Web volatility remain separate. Preserve the dirty source tree in a Git-external source-only archive before edits.

Chart contract: the existing 2D Mirror Cloud and optional metric-based 3D retain role-normalized X, measured importance size and exact conversation/message provenance. Candidate quality and ranking must be separate from these encodings; no invented topic labels, side shifts or filler. Inspect stored real histories locally after the automatic synthetic regression gates, and retain actual-history artifacts only outside Git.

- [x] Read required sources; identify ICU segmentation plus bounded-frequency bonus as insufficient for subject extraction; delegate dictionary engine, independent methodology review and adversarial quality tests.
- [x] Implement bundled Japanese morphology, source-grounded noun-phrase extraction and conversation-specific selection; retire heuristic-only default path.
- [x] Add held-out natural-language quality fixtures; preserve privacy/semantic/count/temporal regressions and document changed lexical definitions.
- [x] Run check and both E2E suites; inspect desktop/mobile/PNG plus actual stored-history output; record exact results and unresolved limits.

Implementation and independent-review findings:

- Production `pipeline.ts` now uses `lexical.ts`, bundled IPADIC morphology and contextual English POS, not the former ICU-boundary repairs. Initialization occurs in the Worker, deduplicates concurrent requests, fails explicitly, and guards stale requests across awaits. Static dictionary assets are shared by Web/private builds; there is no CDN or external NLP call.
- A common observed-form lexical ledger supplies both display modes. Noun-use evidence, procedural-word eligibility and conversation-specific ranking affect selection only; role incidence, token denominators, importance, bias and exact context offsets are separate. Single-character Japanese atoms and suffix/prefix-only items cannot fill the topic view. Adjectival uses are distinguished from nominal/compound uses in bounded grammatical context.
- Source-grounded noun phrases use 2–6 Japanese or 2–4 English atoms and at least two distinct messages. Prefixes and productive suffixes preserve negation and complete technical terms. Positional 80% representative suppression preserves independently used components. No generated semantic topic name is substituted for observed text.
- Stored-history inspection exposed an all-or-nothing resource fallback that synthetic small corpora missed: the initial redesign discarded every phrase when either candidate or position capacity was exceeded. It was replaced by a 6 MiB support sketch, bounded deterministic candidate selection, exact full-corpus recount and exact replay of complete retained families. Approximation affects admission only, not displayed measurements. A 4,800-message / 120,000-singleton synthetic stress preserves all 12 repeated subject families at exactly 400 messages and occurrences each.
- Review found that deleting URL/math/code/citation spans to spaces manufactured English phrases across removed content. Removed spans now preserve hard boundaries; Markdown anchor words are retained but cannot join across markup. Source originals are unchanged. Dictionary-unknown hiragana and English UNKNOWN-as-noun guesses are not sufficient topical evidence. Standalone English modifiers and Japanese adjectival predicates cannot fill a cloud, while real nominal and compound uses remain eligible.
- Visual review of the new natural-language mobile screenshot revealed a second selection pipeline reverting to importance and promoting conversational scaffolding. `overview.ts` and `MirrorCloud.tsx` now pass the committed vocabulary mode into both mobile and preview selection. Topic mode uses topic selection evidence, broad mode retains importance ordering; glyph size stays measured importance. The existing exact 24-term demo fixture remains required.
- Preliminary check passed 338 tests and both production builds. The first full Web run was 27/32: one race test still requested the old isolated adjective `private` (now correctly inside a phrase), two 120-word geometry fixtures included a POS-rejected artificial name, and two runs returned to the landing page during source/HMR changes. The race fixture now uses the standalone noun `privacy` with identical 10,000-thread load and assertions. Stress labels are explicit uppercase synthetic noun identifiers, retaining exact 40/80/120 counts and all original geometry/privacy/omission checks. Final frozen-source reruns below are required, not inferred from these preliminary passes.

Final review also preserves narrowly bounded backtick identifiers with exact cleaned-text provenance. Identifier POS overrides apply only to those observed spans: ordinary verb uses elsewhere cannot inherit the override. Removed markup remains a phrase boundary, reserved marker characters are stripped from untrusted input, and capped or redacted partial identifiers cannot fabricate provenance. Original messages remain unchanged.

Final frozen-source validation (2026-09-10):

| Check | Result | Evidence |
| --- | --- | --- |
| `pnpm check` | PASS, exit 0 | 31 files / 366 unit tests, 65.82s; strict TypeScript, zero-warning ESLint and ordinary production build |
| `pnpm e2e` | PASS, exit 0 | 32/32, 4.7m; existing privacy/network/console guards, exact mobile overview, 40/80/120 one-sided geometry, timeline, 3D and natural-language topic fixtures |
| Added dictionary-recovery Web E2E | PASS | 1/1, 14.4s; malformed dictionary fails safely without a cloud, retry loads the local dictionary and restores analysis; network/storage/console guards remain active. Added after the full-suite enumeration; 33 distinct Web cases passed across the two runs. |
| `pnpm e2e:private` | PASS, exit 0 | final private production build and 12/12, 2.8m; isolated synthetic profiles, offline analysis/PNG, date behavior and durable-store clearing |
| Visual QA | completed | final natural-language desktop/mobile/PNG and stored real-history Chrome/PNG inspected; actual images and counts remain outside Git |
| Repository hygiene | PASS | final `git diff --check`; empty staged diff; private build and synthetic test output remain ignored; actual images and verification notes are outside the repository |

An initial private run passed 10/12 because an old date fixture depended on the literal adjective `undated` becoming a noun. It now uses the ordinary noun `cobalt`, preserving the exact three-point and unknown-date inclusion assertions. The final 12/12 is the completed-source run, not the preliminary result. Five Worker initialization/race tests also cover stale requests and safe failures. No geometry, privacy, race-load or exact-date assertion was weakened.

Inspected final synthetic artifacts: `output/playwright/promptprint-quality-desktop.png` (1440×1000), `promptprint-quality-mobile.png` (390×844), `promptprint-quality-export.png` (2200×1340), and the topic/3D variants. Existing `artifacts/promptprint-demo.png` and stress/privacy evidence were regenerated using synthetic inputs only. Mobile evidence is Chromium viewport emulation, not physical-phone testing. The visual-QA workflow specifically caught and corrected the mobile reranking bug; it did not change measured glyph sizes or role coordinates for appearance.

Stored real-history verification used only the extension's existing local corpus, reloaded against the final build. Observed multiword subjects now survive the formerly all-or-nothing phrase capacity failure. Desktop labels and the 2200×1340 PNG were inspected for overlap, clipping, source disclosure and the retained axis/size contract. Exact saved/analyzed counts, private screenshots, PNG, partial-acquisition status and reopening/clear instructions are recorded in the Git-external `PRIVATE_STATUS.md`. This is genuine stored-history reanalysis, not evidence of new source retrieval, complete-account coverage or a user-accepted semantic quality score.

Final assets: ordinary `index-yw5stY1A.js` / `index-4CQWLikd.css` / `analysis.worker-DCYxVUxc.js`; private `private-NV-W_dLu.js` / `private-CdbM6knF.css` / `private-analysis.worker-CSbnBLOU.js`.

Remaining limits: this is local observed noun/phrase extraction, not semantic topic generation, synonym clustering or word-sense disambiguation. Some generic nouns, names, identifiers and POS mistakes remain visible in actual history; dictionary-unknown terms can be omitted. The dictionary is 17,791,956 bytes compressed / 100,260,388 bytes expanded, with additional tokenizer, English-model and corpus memory overhead. Long-message/candidate caps and layout omissions remain explicit. The 6 MiB support sketch affects only bounded candidate admission; retained family counts and positions are exactly recounted. Human relevance acceptance and physical-phone validation remain outstanding.

The archive created before this redesign is `/private/tmp/promptprint-rebuild-20260909-GMJBMV/before-rebuild-source.tar.gz`, SHA-256 `726430e73e3bb046fd2b0d915954e97c9d7fde8e56b59d1a09b50ae442177160`. It contains source only and must be extracted separately for recovery. Actual stored-history measurements and screenshots are kept outside Git in that private task directory. No acquisition was resumed in this revision; no staging, commit, push, deployment or publication was performed. The archive and private images are in temporary storage, not a durable backup.


## Topic-readable vocabulary selection — 2026-09-09 (completed)

The owner authorizes correcting extraction/selection so the cloud conveys conversation topics and context. Preserve the existing dirty tree, local-only analysis, exact role incidence/bias/importance definitions and all 2D/3D/date/private privacy paths. No source acquisition, remote push, publication or external text processing. Recovery snapshot: `/private/tmp/promptprint-topics-20260909-dEfbOH/before-topics-source.tar.gz`, SHA-256 `c6f29c1200096b504ebd5d45d32a07ef0ae9baebd562e237d195a5386f79495a` (source only; extract elsewhere, temporary storage).

Chart contract: existing Mirror Cloud and metric-based 3D, one observed selected term per mark. Improve lexical boundaries and add a display-only topic selection policy, distinct from the quantitative size/X/Y/Z measures. Default prioritizes topic-bearing candidates; a broad vocabulary setting retains procedural/AI framing vocabulary for inspection. Never fill vacant slots with rejected low-information candidates or manufacture topic labels. Corpus-local evidence is not a claim of semantic understanding or population-level distinctiveness. Preserve existing palette, source/date/denominator disclosures and context links.

- [x] Read repository source-of-truth documents and visualization/Playwright skills; archive current source; delegate lexical boundaries, independent methodology review and browser regressions.
- [x] Implement and document bounded extraction/selection rules, mode/omission disclosure and shared Web/private/2D/3D/PNG integration.
- [x] Add realistic mixed-topic, generic-only, meaningful short-word, independent compound and metric-invariance regressions.
- [x] Run `pnpm check`, Web/private E2E, inspect desktop/mobile/PNG; record exact evidence and remaining limits. Synthetic evidence must not be presented as real-history validation.

Implementation/review findings:

- Topic eligibility runs before quotas, representative suppression and adoption's top-eight cutoff, without deleting raw statistics. The inverse-conversation-coverage bonus is bounded at 35%; all-conversation themes retain their full base weight. The finite exact procedural set is not a content-topic whitelist. The desktop/mobile/3D views and insight/provider candidate sets cannot refill with rejected terms. Narrow nonspecific evaluative families are filtered, not descriptive vocabulary wholesale.
- The review caught false exclusion of `general relativity`, `information theory`, `specific heat`, `step function` and `check valve` when all generic components were treated as wrappers. The final wrapper rule is restricted to five exact Japanese discourse markers; observed meaningful Japanese/English compounds survive. A three-message literal single-thread compound exception avoids discarding a deeply discussed focused topic.
- Boundary repair preserves observed surfaces/UTF-16 spans. It includes 16 known kana spellings, 46 adjective stems × 10 endings, adjacent katakana runs <=32 UTF-16 units and the explicit 語 suffix; no lemma/POS/meaning inference. Stopword-tail protection prevents `さいくださいころ` from stealing the tail of `ください`. Hidden terms are checked against complete raw-segment spans (bounded 32-unit joins) before restoration and complete final tokens afterward, preserving gaps and the unhidden counterpart. `NoSQL` does not match hidden `no`.
- The first full browser run passed 28/31 and found three actionable integration issues. Detail-mode canvas measurement changed the hidden mobile overview from 24 to 23 terms; it now updates only while overview is active. Mobile PNG now has a stable accessible full name. Clearing ordinary data resets the ephemeral camera/view to default 2D for a fresh demo/import. The original exact 24-term mobile assertion remains unchanged. The new private clear test waits for the explicit durable-clear completion before asserting the DB is strictly empty. These were not fixed by relaxing geometry, data or privacy assertions. Early development/HMR interference was suspected, but frozen-source snapshots identified the latter two failures as accessible-name/view-state assumptions, not lost data or a failed analysis.
- Hand-counted synthetic evidence: 20 conversations / 80 messages with eight generic words repeated in every message now select the five actual topic terms, not all 13 candidates; broad mode preserves all 13 with exact surviving-term statistics. The ordinary demo has 49 aggregate candidates, four compound representations and nine procedural exclusions: 36 topic terms; broad mode retains the prior 45. The realistic nine-conversation / 36-message browser fixture selects 19 topical candidates, reports six exclusions, and keeps role incidence/token metrics identical across modes.

Final completed-source validation:

| Check | Result | Evidence |
| --- | --- | --- |
| `pnpm check` | PASS, exit 0 | 24 files / 301 unit tests, 23.40s; strict TypeScript, zero-warning ESLint, ordinary production build |
| `pnpm e2e` | PASS, exit 0 | 31/31, 2.4m; original privacy/console/network guards, both-sided 40/80/120 stress cases, exact mobile overview, timeline, 3D and new vocabulary flows |
| `pnpm e2e:private` | PASS, exit 0 | final private production build and 12/12, 2.3m; isolated synthetic profiles, offline analysis/PNG and local-storage clearing |
| Independent review | GO | relevant five files / 143 tests PASS, 7.74s; desktop/mobile/empty/2D PNG/3D PNG inspected, heuristic limits documented |
| Independent browser targets | PASS | static Web 3/3, 27.0s; private offline 1/1, 3.8s; the previously failing integration cases also passed 3/3, 8.4s |
| Repository hygiene | PASS | `git diff --check`; no staged files, commit, push, publication, new runtime dependency or permissions |

Inspected synthetic artifacts in `output/playwright/`: `promptprint-topics-desktop.png`, `promptprint-topics-mobile.png`, `promptprint-topics-mobile-3d.png`, `promptprint-topics-tooltip.png`, `promptprint-topics-empty.png`, `promptprint-topics-export.png`, `promptprint-topics-broad-export.png` and `promptprint-topics-3d-export.png`. Both PNG modes are 2200×1340. The standard `artifacts/promptprint-demo.png` and existing privacy/layout evidence were regenerated. Separate synthetic private screenshots/PNG are in `/private/tmp/promptprint-private-20260909/test-evidence/synthetic-private-topics-{desktop,mobile,export}.png`; no actual account data or images were accessed or added in this revision.

Visual findings: the nine-conversation fixture displays 19 eligible terms on desktop with no layout omission; mobile displays 13 and explicitly reports six layout omissions. The 3D PNG retains all 19 exact points and reports one omitted text label; co-located points are not displaced for appearance. Captions distinguish the six policy exclusions from physical omissions and fit above the PNG plot. Desktop/mobile/PNG inspection found no clipping or overlapping displayed labels in these fixtures. Mobile evidence is Chromium emulation, not physical-phone validation.

Final assets: ordinary `index-Egu3ttV3.js` / `index-4CQWLikd.css` / `analysis.worker-DmyTrnYO.js`; private `private-BGhG6Ugy.js` / `private-CdbM6knF.css` / `private-analysis.worker-Buzk12uj.js`. Reload `http://localhost:5173/` and run demo/import again to use the corrected stream. The existing private page uses the rebuilt assets after reload and local reanalysis; acquisition is not required or resumed. In the existing `表示条件を変える` controls, choose `語の選び方 → 使用語を広く` to inspect excluded procedural candidates.

Remaining limits: finite observed-form repair and eligibility rules are not morphological or semantic analysis. Unknown inflections/kana spellings and ambiguous adjoining katakana can still fragment or merge; listed general words can be meaningful in a particular domain. The bounded selection score uses this corpus only, not a reference population. Broad mode restores eligible procedural vocabulary, not punctuation, stopwords or hidden terms. The same surviving term retains exact statistical values across modes, but its rendered font size can change with the selected set's relative scaling. This revision verifies synthetic conversations only, not real-history quality. The source snapshot above provides rollback material outside Git; extract separately and preserve subsequent user changes before restoring anything.

Visualization and Playwright skills guide the existing SVG/Canvas surface and real rendered QA. The optional skill CLI wrapper exits 127 (`playwright-cli: command not found`); mandated repository Playwright suites and their screenshot outputs supply browser verification instead. No new runtime dependency/request or persistence was added. No real-history access/acquisition, staged files, commit or push in this revision.


## Selectable metric-based 3D distribution — 2026-09-09

Owner requests a meaningful three-dimensional alternative, with the existing 2D Mirror Cloud retained. No push, publication, acquisition restart or external dependency/request. Existing dirty source is preserved in `/private/tmp/promptprint-3d-20260909-6wrbIv/before-3d-source.tar.gz` (SHA-256 `7342a71c1f3bf795902cf5b818da1317e951afe32e4dc0ea5c7419fa7141f048`; extract separately, temporary storage).

Chart contract: one point per current `result.layout` term, preserving selection, hidden terms, compound suppression and reported layout omissions. X = −bias (user −1, AI +1); Y = arithmetic mean of the two role-specific message incidence rates (observed role only if the other role is missing); Z = conversation coverage / current filtered conversation count. The three fixed domains are [−1,1], [0,1], [0,1], including across timeline frames. The third metric distinguishes broadly shared vocabulary from words concentrated in a few conversations. Orthographic SVG/Canvas projection, constant point/label size, existing palette/paper language; no fabricated jitter, semantic-distance claim or perspective-size encoding. Missing-role comparisons stay gray at X=0, not shared. Screen overlap is possible; labels may be omitted but every point is available in a semantic selector. Sparse/empty periods are explicit, not padded with synthetic observations. Rotated screen-left is not the X coordinate; visible axis explanations supersede the 2D reading only while in 3D.

- [x] Read repository source-of-truth documents and applicable visualization QA / Playwright skills; delegate pure projection/tests, browser regression tests and independent semantic review.
- [x] Implement fixed-domain geometry, accessible camera/view controls, ordinary/private integration and current-camera PNG export.
- [x] Verify exact metrics, overlap handling, immutability, deterministic projection, timeline/context races and all legacy privacy/layout tests.
- [x] Inspect desktop/mobile/PNG output, document results and limitations, leave private data outside Git.

Independent review/visual QA drove these corrections: preserve all three axis names even at extreme angles (alternative label positions with endpoint leaders); clear a pointer hover when keyboard focus changes; replace the residual 2D screen-left/right introduction in 3D; reserve a full em for wide Latin W/M as well as Japanese labels. Mobile inspection found that the higher-priority responsive CSS layer overrode the new auto-height rule and hid the 3D controls under analysis. The fix is in that same responsive layer plus non-shrinking 3D content, with strict cloud/control/caption/opening/analysis boundary assertions. Mobile dates now own a full row. In all-time 2D only, the redundant cross-period-size sentence is deferred until a bounded period is shown; all core metric/side/omission explanations and the original 24-term mobile fixture remain intact.

Final check: `pnpm check` PASS, 23 test files / 272 unit tests (10.59s), strict TypeScript, zero-warning ESLint and ordinary production build. `pnpm e2e` PASS, 28/28 (1.5m), including all original Web/privacy/2D/time regressions and five 3D flows. `pnpm e2e:private` PASS, 11/11 (2.1m), using synthetic isolated extension profiles, including offline 3D/date/PNG and the new anti-occlusion geometry. The independent 3D target suite passed 5/5 (19.6s), plus the long-glyph test passed three repeated runs. Browser assertions keep exact world/attribute coordinates; actual SVG/Canvas transforms permit only sub-0.001px float32 rounding. Long-glyph geometry waits for completed SVG layout with the same strict bounds, not relaxed limits. Initial concurrent development runs hit server ownership/HMR lifecycle interference; final Web runs use a separately owned loopback server and frozen production source. No original test was skipped or weakened.

Inspected synthetic evidence in `output/playwright/`: `promptprint-3d-demo-desktop.png`, `promptprint-3d-demo-cloud-desktop.png`, `promptprint-3d-demo-cloud-mobile-390.png`, `promptprint-3d-demo-cloud-mobile-320.png`, `promptprint-3d-demo-export.png` (2200×1340; all 45 points, 21 text labels omitted), `promptprint-3d-mobile.png`, `promptprint-3d-export.png` and `promptprint-3d-long-labels.png`. Private synthetic evidence is under `/private/tmp/promptprint-private-20260909/test-evidence/synthetic-private-spatial-{desktop,mobile,mobile-cloud,export}.png`. The root and reviewers inspected desktop/mobile and both sparse/dense PNG output. This turn used synthetic fixtures only: no new real-history acquisition or real-account/physical-phone validation is claimed.

Final assets: ordinary `index-0suvGFYc.js` / `index-7Bd1KawQ.css`; private `private-DjWz9ng4.js` / `private-D4mKFp7G.css`. Existing analysis workers remain unchanged by this view. Preview `http://localhost:5173/` returned HTTP 200; choose `3D 分布` above the chart, `2D ミラー` to return. The built private page picks up this view on reload without resuming acquisition. No staging, commit, push, publication, runtime dependency, new permission, external upload or real-data file was added.

Remaining intentional constraints: related descriptive axes are not a semantic topic map; low rates cluster near the floor of the fixed scale; coincident points stay coincident; mobile/desktop labels are capped at 10/28 with all terms retained in the selector; long display labels can shorten without changing statistics; inherited 2D selection/layout omissions still apply. PNG shares camera/world coordinates but fits its own aspect ratio and omits temporary selection/hover highlighting. No movie, free-flight camera or perspective encoding is included.


## Date filtering and chronological preview — 2026-09-09

The owner requests arbitrary date bounds and a day/month playback of the existing Mirror Cloud. Preserve ordinary Web volatility and private local storage isolation; no acquisition restart, external requests, publication or push. Existing dirty work is preserved in the source-only `/private/tmp/promptprint-timeline-20260909-BKwDyM/before-timeline-source.tar.gz` (extract elsewhere for recovery; temporary storage).

- [x] Read AGENTS and the five source-of-truth documents; inspect both worker/UI paths. Use visualization QA and Playwright skills, and independent core, browser-test and review agents.
- [x] Implement inclusive JST calendar bounds with explicit missing/fallback timestamps, deterministic day/month windows and cumulative frames (maximum 366; never silently skip empty intervals).
- [x] Connect the same compact timeline controls to ordinary and private analysis. Wait for each worker completion plus dwell before advancing; pause on manual changes, context/export, page hiding and errors. Keep committed period labels synchronized with the displayed result, including empty periods and PNG.
- [x] Validate boundaries, races, correct frame statistics, local-only privacy, desktop/mobile/PNG rendering; record final checks and remaining limitations.

Chart contract: each frame aggregates actual normalized messages in the selected calendar window; timestamp fallback is message → conversation creation → conversation update. Unknown dates stay in all-time analysis but are excluded from bounded periods. X remains relative role-normalized message incidence, size is the existing within-frame importance score, Y has no meaning. Sizes are rescaled within each frame, not an absolute cross-time scale. No fabricated interpolated positions or skipped empty periods. Retain the blue/purple/rust palette, warm grain, SVG/mobile/Canvas geometry constraints and original context separation.

Independent review and browser findings incorporated: relative-preset → first custom frame now remains playing; metadata retains provider provenance even for an empty period; completed external presets update the editing range without shrinking a playback range on each frame; mobile settings use document flow instead of an occluded absolute-positioned summary; private analysis errors are separate from source/export errors and clear on local retry. A first full Web run exposed an existing queued-hide regression because rejecting busy context clicks prevented hiding. The fix snapshots the selected term, bounded excerpts and period together, preserving busy hide and preventing old-statistic/new-excerpt mixtures; the original test is unchanged and a new delayed-frame context test verifies the stronger guarantee. The private drawer's close callback is stable across progress-clock renders.

Final validation on the completed source (2026-09-09):

| Check | Result | Evidence |
| --- | --- | --- |
| `pnpm check` | PASS | 20 files / 227 unit tests, 11.19s; strict TypeScript, zero-warning ESLint, ordinary production build |
| `pnpm e2e` | PASS | 23/23, 1.2m; existing privacy/geometry guards plus five date/playback/context regressions |
| `pnpm e2e:private` | PASS | final private build and 10/10, 2.0m; synthetic isolated profiles, offline date/cumulative replay and actual worker error recovery |
| Visual QA | PASS | inspected synthetic desktop, 390px cloud/settings, selection snapshot and 2200×1340 PNG; native Chrome stored-history monthly frames and private PNG also inspected |
| Repository hygiene | PASS | diff check; no staged files, commit, push, external upload, added runtime dependency or permissions |

Synthetic evidence: `output/playwright/promptprint-timeline-desktop.png`, `promptprint-timeline-mobile.png`, `promptprint-timeline-mobile-cloud.png`, `promptprint-timeline-export.png`, `promptprint-timeline-selection.png`; ordinary `artifacts/promptprint-demo.png` and existing stress/privacy artifacts regenerated by the unchanged suite. Private synthetic evidence is `/private/tmp/promptprint-private-20260909/test-evidence/synthetic-private-timeline-cumulative.png`. Real images, exact counts and verification notes remain outside Git in `/private/tmp/promptprint-timeline-20260909-BKwDyM/PRIVATE_STATUS.md`. The final installed extension page was reloaded and replayed using only its existing stored corpus; acquisition was not resumed. Actual mobile evidence is synthetic Chromium emulation, not a physical-phone or private-history mobile claim.

Recovery archive SHA-256: `1d696c922932ca27eb0d70bac16b0b3d837cd8526830fb7f3e176bba3f89614c`. Final assets: ordinary `index-CajurDht.js` / `analysis.worker-BMvaJ-Ca.js`; private `private-CGLOkmDs.js` / `private-analysis.worker-7DFyQfFV.js`. Localhost preview remains available. Limitations: JST/fallback dates are explicit approximations; per-frame reanalysis latency adds to dwell; maximum 366 frames; no absolute cross-frame size calibration or movie export. These limits and controls are documented in product/technical/acceptance/limitations/private-local docs.

## Conversational-noise refinement — 2026-09-09

The owner requests suppression of particles, punctuation, exclamations and simple acknowledgments, with an independent reviewer. Preserve the existing chart contract, local-only analysis, original contexts and message-count denominators. Do not resume source acquisition or publish/push anything.

- [x] Read the source-of-truth documents and inspect tokenizer/phrase/statistics/UI paths. Found missing English acknowledgments and ICU splitting `ください` into `くだ` / `さい`, allowing an unwanted phrase to be reconstructed. Punctuation already separates word tokens and must remain a phrase boundary.
- [x] Preserve the current dirty source tree in `/private/tmp/promptprint-noise-20260909-NegGmp/before-noise-source.tar.gz` before edits; keep earlier changes intact.
- [x] Add conservative exact-token / contiguous-segment stopword recognition, not blanket kana removal or substring replacement; independently review false positives and boundary cases.
- [x] Verify noisy and noise-only input, meaningful short words, word/phrase modes, offsets, unchanged originals and coherent frequency denominators. Run check, Web/private E2E and inspect desktop/mobile/PNG evidence.

Skills: visualization QA preserves the existing SVG/Canvas encoding contract; Playwright validates the actual local rendered flow. No new visual surface, dependency, external API or dictionary download is planned.

Reviewer findings incorporated: standalone `ー`/iteration signs passed Unicode letter checks, so reject signs-only tokens while preserving `データ`/`コーヒー`/`人々`. Do not ban the ambiguous fragments `てい`, `せん`, `かな`, `こう` in isolation: review reproduced unintended losses in kana-input/fibre/koji words. Match known complete forms such as `ません` and `ています` instead. Add `オッケー`/`オッケイ` and common exclamation variants. The independent code reviewer found no blocking issue; independently ran 56 analysis/cleaning/noise tests successfully and confirmed bounded look-ahead/offset preservation. A separate browser reviewer added two strict noisy/empty-input flows and inspected their synthetic evidence. Neither reviewer accessed real histories.

A final review also reproduced `じゃばら` losing its first segment when `じゃ` was excluded. Remove that ambiguous standalone rule and match only complete `じゃない` / `じゃなく` / `じゃありません` forms; the regression preserves both content segments. The default rule remains conservative, not a complete morphological classifier. Known stopword forms discussed as literal topics can be omitted, other inflection fragments can remain, and fallback unspaced Japanese is explicitly lower quality.

Source snapshot SHA-256: `5ed74f29794f5675698b2e6a0b276659bec6262ff41829b81eb52c340cd371bb`. Recovery: inspect/extract this source-only archive into a separate directory, never over existing unpreserved work; it excludes `.git`, dependencies, builds and test artifacts. It is OS temporary storage, not a durable backup.

Final verification (2026-09-09, after the ambiguous `じゃ` rule was withdrawn):

| Check | Result | Evidence |
| --- | --- | --- |
| `pnpm check` | PASS | 18 files / 167 unit tests, 8.11s; strict TypeScript, zero-warning ESLint and ordinary production build |
| `pnpm e2e` | PASS | 18/18 Chromium tests, 47.4s; previous 16 tests unchanged, plus strict noisy/empty-input regressions |
| `pnpm e2e:private` | PASS | separate final private build plus 8/8 unpacked-extension browser tests, 1.8m; synthetic source responses in a disposable test profile |
| visual/geometry QA | PASS within tested cases | noisy synthetic desktop, 390×844 mobile and actual Canvas PNG; exact five content terms, original excerpt retained, meaningful sides, bounded glyphs, no collisions, deterministic resize return, empty-state recovery |
| privacy guards | PASS | same-origin network, console, ordinary-Web durable-storage and PNG text guards retained; no source retrieval resumed, no push/publication |

Synthetic artifacts: `output/playwright/promptprint-noise-desktop.png`, `promptprint-noise-mobile.png`, `promptprint-noise-empty.png`, `promptprint-noise-export.png`. Existing demo/stress artifacts were regenerated by the full suite. All were synthetic; real-data imagery is not in the repository. Initial new tests caught two mistaken fixture assumptions (ICU splits `さいころ`; context display already applies NFKC); expectations now assert the actual pre-existing segmentation/display contracts, not weakened noise or geometry acceptance.

The owner’s already-saved partial corpus was reanalyzed offline in the installed Chrome extension with the final bundle. Targeted excluded labels were absent, saved thread/message counts were unchanged and acquisition stayed stopped. This is local reanalysis of existing real data, not a new acquisition or completion of the earlier 1,000-thread target. The screenshot skill saved the native-window evidence and the application saved its PNG outside Git in `/private/tmp/promptprint-noise-20260909-NegGmp`; exact counts, image paths and remaining real-corpus limitations are in its `PRIVATE_STATUS.md`. Ordinary Web localhost preview remains available; reload and re-run demo/import for fresh analysis. The private Chrome page is already updated. No staged files, commits or pushes were made.

## Private no-export revision — 2026-09-09 (in progress)

The owner explicitly authorizes a separate, unpublished personal acquisition build: local browser extension, read-only requests to the source service, and local normalized-history/checkpoint persistence. The ordinary Web build keeps its no-network/no-persistence guarantees. No push, PR, publication, deployment, tunnel or external artifact upload is authorized. Private bodies, credentials, traces, screenshots and reports must stay outside Git. This revision does not claim official integration or terms compliance.

- [x] Read the entire supplied private mission and repository source-of-truth documents. Existing semantic/statistical changes remain uncommitted and are preserved.
- [x] Started browser connection checks. In-app ChatGPT is a different free account and is excluded. Native Chrome shows the owner's Pro session; browser-level Chrome connector is unavailable, so use the explicitly permitted unpacked local extension path, with user permission at installation.
- [x] Verify the requested personal identity, one actual list response and three normalized conversation bodies. Native Chrome's installed local extension provided the actual response; no token paste or export file was needed.
- [x] Deliver a 20–50-thread real-data cloud and PNG; pause/reload preserved the same normalized thread/message counts. Exact private measurements/images are in the Git-external status report.
- [ ] Acquire up to the selected target (default 1,000) or exhaust the supported listing. **Not achieved:** the live source returned HTTP 429 and acquisition stopped with saved partial results. No repeated manual retry, alternate route or rate-limit bypass was performed. Exact final real counts and resumption instructions are in the Git-external private status report, not the synthetic test results.
- [x] Implement resumable account-scoped persistence, safe bounded retries, cancellation/clear races, progress and honest coverage labels.
- [x] Preserve and verify semantic layout/statistics; run check, Web E2E and additional private acquisition tests; inspect the actual partial real-data screen and PNG saved outside Git.

Private evidence location for this run: `/private/tmp/promptprint-private-20260909` (mode 0700, outside repository; OS temporary storage, not an archival backup). Source snapshot before this revision: `before-private-source.tar.gz` there. Private durable conversation storage will belong only to the extension origin's IndexedDB, separate from ordinary Web storage. Full browser/HAR tracing is deliberately avoided because it would retain authentication secrets. Only safe response schemas/counts are diagnostic output.

Skill routing: Playwright is used for the explicitly requested local browser tests. Browser-trace/browser-to-api were inspected for traffic discovery but their full-firehose capture is not used; the mission's no-secret logging and minimal data exposure take precedence. OpenAI documentation was checked in the preceding feasibility task; this implementation verifies actual source responses instead of assuming a documented history API exists.

### Private implementation findings and intermediate evidence

- Separate `private.html` / `dist-private` MV3 build, with only `scripting` and the `https://chatgpt.com/*` host permission. Source requests are GETs inside the permitted logged-in tab. Identity, personal workspace and subsequent identity continuity are checked; secrets never become normalized records or diagnostics. Ordinary `App` does not import the private store/transport.
- The source returned a `default` account alias and a named entry for the same verified personal account ID. Counting entries incorrectly failed closed. Deduplicating exact nonempty account IDs fixes this without accepting multiple distinct personal IDs. Both cases have regressions.
- The live list's `total` behaved like a look-ahead value (`limit + 1`), not a proved history count. It is now ignored for progress and termination. Every nonempty page advances the offset; only an empty page proves the end of the supported listing. Final offset is a listed-row count, not proof of all-account/project/archive coverage. Pagination can change while source conversations are updated.
- Source normalization excludes hidden reasoning/control channels, preserves only the selected graph branch, and deduplicates message IDs within that selected branch. Known bounded citation control markup is removed only from analysis text, not stored/context originals; ordinary `cite` and unknown/malformed constructs are not broadly deleted. Token numerator and denominator use the same cleaned stream.
- IndexedDB persists normalized conversations and checkpoints atomically. Dedicated normalization/analysis workers, initial 25-thread partial analysis, throttled updates, explicit failures, target selection and cancellation are implemented. Web Locks serialize acquisition across tabs; a data-free BroadcastChannel message clears peer views. Abort races release locks even while injected source fetches or identity responses are still pending; late responses cannot restore cleared data.
- A genuine pending-fetch clear deadlock was reproduced by extension E2E after adding Web Locks, then fixed at the cancellation boundary; the test remained strict. An initial `pnpm check` also exposed Vitest trying to execute the new Playwright suite; only runner routing was corrected by excluding `private-e2e/**` from Vitest, with those tests still run through their dedicated Playwright config.
- Intermediate latest `pnpm check`: PASS, 17 files / 150 unit tests, strict types, zero-warning lint and ordinary production build. Latest ordinary `pnpm e2e`: PASS, 16/16, 39.4 seconds, including network/storage/console guards and one-sided desktop/mobile/PNG stress fixtures.
- Intermediate private extension E2E: PASS, 8/8, 1.8 minutes. Actual unpacked Chromium extension, workers and IndexedDB; all source HTTP replaced by synthetic fixtures, never the owner's profile. Covers 100 synthetic threads / 200 visible messages, probe, pause/reload/resume, deduplication, account aliases, ambiguous accounts, 401/403/429, initial-identity cancellation, cross-tab clear, SVG geometry and private PNG. Separate 3,000-thread/6,000-message unit stress uses an in-memory synthetic store, not a real-history performance measurement.
- Native CUA page capture intermittently returned a blank page while the actual Chrome window rendered correctly. The screenshot skill's permitted OS-window capture verified the real screen and saved it only outside Git. No browser profile/cookies were copied or debug-port workaround used.
- Final additional guards: corpus revision changes on target selection, refreshed body content and cached membership changes; same-count updates cannot reuse stale analysis. Changing the expected identity discards the prior chart/worker/export without deleting that account's saved records. Ordering is verified across page boundaries. A separate source-read Web Lock remains held until the physical injected invocation settles, while local cancellation/clear stays prompt. Repeated cancellation of queued identity/body reads is tested; strict overlap bounds across repeated destruction of the extension context remain unverified and are explicitly documented.
- Final validation before real acquisition completes: `pnpm check` PASS, 17 files / 158 unit tests; ordinary `pnpm e2e` PASS, 16/16 in 39.4s; latest private E2E PASS, 8/8 in 1.8m, now including 390×844 responsive controls, SVG bounds/X limits/collisions, drawer containment and exact restored desktop coordinates. Private synthetic desktop/mobile/PNG evidence was visually inspected. The temporary one-off connection diagnostic page was removed after the production three-body probe passed; only the bounded production acquisition route ships. Its removal changes no production app bundle behavior.
- Final live outcome: the owner's confirmed account produced a saved/normalized/analyzed multi-hundred-thread partial corpus and a real PNG, with no export request, JSON upload or token paste. HTTP 429 prevented the standard target. The Chrome page remains on the actual Cloud. Real screen/PNG and precise counts are in `/private/tmp/promptprint-private-20260909/PRIVATE_STATUS.md`; downloaded real PNGs were moved from Downloads into that mode-0700 private folder. No claim of target completion, complete history coverage, or real 3,000-thread performance is made. Final `pnpm check` rerun after diagnostic cleanup passed 17/158 in 6.89s; `pnpm build:private`, script lint, and `git diff --check` also passed. No files were staged or pushed.
- The exact convenience command `pnpm e2e:private` was then rerun after diagnostic-page cleanup: build PASS and 8/8 browser tests PASS in 1.8m. The owner's live acquisition remained stopped on HTTP 429 throughout this synthetic-only run.

> Status: semantic/statistical correctness revision completed and validated, 2026-09-09 05:10 JST. Clean checkpoint `7914e4b` preserves the previous design. Earlier milestones below remain historical evidence.

## Current revision: trustworthy lexical coordinates and counts

- [x] 2026-09-09 — Read repository instructions, specifications, current analysis/layout/render/export code and existing regression coverage. Confirmed unrestricted fallback X movement, smoothed zero-observation shared classification, repeated-phrase occurrence loss, and mobile fixed-slot collisions.
- [x] Constrain X to its bias-derived neighborhood and the correct half; exhaust Y space first, uniformly scale the cloud or report omissions. Reuse constraints on mobile and preserve collision boxes in PNG.
- [x] Use empirical message occurrence rates, require both-role observations for shared, distinguish missing comparison material, and compute role token frequencies on one explicitly defined content-token stream.
- [x] Deduplicate display candidates by actual positional containment (80% threshold), retaining independently used components and unmodified aggregate statistics.
- [x] Add persistent compact reading instructions, source/period/count context, omission disclosure, and detailed role metrics within existing surfaces. No landing redesign, new screen, service, or dependency.
- [x] Run `pnpm check` and `pnpm e2e`, retain privacy/network/console checks, generate and visually inspect desktop, mobile and PNG evidence; record exact outcomes and fixture-only limitations.

Chart contract: the existing interactive SVG/Canvas Mirror Cloud compares lexical use within the filtered conversation set. Grain is one term, with per-role message-document frequency and content-token occurrence counts. X encodes relative empirical message occurrence rates; Y has no meaning; size encodes the existing logarithmic message/conversation-coverage importance score. Shared requires positive observations in both roles and `abs(bias) < 0.18`; an absent role is explicitly insufficient, never shared. The established blue/violet/rust palette, neutral paper, grain, gradient and local-only data path remain. When space is insufficient, omit rather than falsify position and show the count. Quota-selected display proportions are not corpus proportions. Only synthetic demo/export-shaped fixtures are available; no real-history validation will be claimed.

Recovery: implementation is complete, with no new dependency, service or destructive Git operation. `git diff` identifies this revision against the clean checkpoint. No commit/push was requested for this revision, so the verified changes remain in the working tree. The existing localhost:5173 development server (PID 9881) was left running; reload the preview and rerun the demo/import to discard any old in-memory analysis.

### Revision findings and intermediate validation

- Strict X interval: target ±5.5% of canvas width, intersected with the full padded word's semantic half and canvas bounds. Free-Y-interval search replaces unrestricted spiral/grid fallback. Whole-cloud anchored retries inside that interval avoid wasting narrow columns; this was needed to keep the existing dense mixed-120 fixture's >=90-word retention assertion passing without relaxing it. Common scales 1.0–0.2 retain a 13-unit floor.
- Mobile uses the same engine and observes actual available canvas height; fixed-slot overflow is removed. Axis and caption occupy normal flow, preserving the exact opening/analysis boundary.
- Empirical bias removes the false shared classification at 10/100 vs 0/4. Missing roles are explicitly neutral/insufficient. Shared insight classification now uses exactly the same evidence and .18 threshold as the chart. Composite message identities prevent reused message IDs across conversations from collapsing DF.
- Phrase extraction now uses bounded candidate discovery followed by complete occurrence counting of accepted phrases. A work-cap fallback emits a warning and uses words only instead of partially counting phrases. Display selection uses >=80% actual positional containment, no substring-only rule or 35% phrase cap. The demo still has 49 aggregate terms; 4 redundant components are represented by compounds, leaving 45 display candidates. Both unit and browser fixtures assert those exact counts.
- Initial `pnpm check`: PASS, 90/90 unit tests, strict types, zero-warning lint and build. First browser rerun passed 8/9; the old hard-coded mobile count 49 was updated to the verified new count 45, while the exact 24-word overview and all interaction/privacy assertions remain.
- Added browser geometry/Canvas-ink tests found a Japanese SVG baseline offset despite non-overlapping modeled boxes. The renderer now centers actual glyph bounds, remeasures on resize and contracts unexpectedly wide local-font glyphs. PNG font scale was corrected from 1.75 to 1.23 to match the limiting coordinate scale. A resize test initially sampled the still-mobile detail DOM; it now waits for the media-query state and two animation frames before comparing exact glyph/model coordinates, retaining the strict equality assertion.
- Intermediate `pnpm e2e`: PASS, 15/15 in 53.4 seconds, including every one-sided 40/80/120 case in both directions on desktop/mobile/PNG and preserved privacy guards. Final rerun pending after tooltip-boundary handling and missing-role UI coverage.

### Final validation and visual evidence — 2026-09-09 05:10 JST

| Command / flow | Result | Exact evidence |
| --- | --- | --- |
| `pnpm check` | PASS, exit 0 | strict TypeScript; ESLint zero warnings; 10 Vitest files / 90 tests (16.20s); 37-module Vite production build (788ms) |
| production sizes | recorded | worker 56.15 kB; app JS 247.87 kB / 78.88 kB gzip; CSS 35.28 kB / 7.87 kB gzip |
| `pnpm e2e` | PASS, exit 0 | 16/16 Chromium tests, reported 1.2m; all previous nine flows retained plus six one-sided stress cases and explicit missing-role UI coverage |
| `pnpm e2e --grep 'one-sided 120'` | PASS, exit 0 | 2/2 in 17.9s; final artifact-only rerun waits for the transient export toast to disappear, leaving the mobile omission caption unobscured; no production behavior changed |
| SVG and PNG geometry | PASS | actual local-font SVG boxes and Canvas ink extents checked for collisions, correct half, padded bounds and X-drift limit; exact desktop coordinates/glyph boxes restored after mobile resize |
| demo representation | PASS | 49 original aggregate terms, 4 positionally redundant components, 45 detail terms and exact 24-term mobile overview |
| privacy/accessibility | PASS | exact-origin network and console-error guards; empty durable storage; hidden terms/private sentinels excluded from PNG; keyboard focus/Enter/Escape; delayed import/export and stale filter/hide races |
| visual inspection | PASS | desktop and mobile layouts, Japanese glyph alignment, detailed tooltip, 2200×1340 PNG and both directions of stress evidence; no opposite-half filler, clipping or overlapping labels in inspected artifacts |
| `git diff --check` | PASS | no whitespace errors; no dependencies or unrelated landing edits |

Artifacts (repository-relative paths):

- `artifacts/promptprint-landing.png` — unchanged landing appearance.
- `artifacts/promptprint-demo.png` — 1440×1000 full cloud with persistent caption.
- `artifacts/promptprint-demo-full.png` and `artifacts/promptprint-ultrawide-analysis.png` — existing analysis view at desktop/ultrawide sizes.
- `artifacts/promptprint-mobile-cloud.png` — 390×844 first viewport; `artifacts/promptprint-mobile.png` — full mobile page.
- `artifacts/promptprint-tooltip.png` — role message/token metrics and conversation coverage; tooltip bounds also asserted.
- `artifacts/promptprint-export.png` — actual downloaded 2200×1340 privacy-safe PNG (the flow hides ロボット and selects 40 terms before export).
- `artifacts/promptprint-stress-user-desktop.png`, `artifacts/promptprint-stress-user-mobile.png`, `artifacts/promptprint-stress-user-export.png` — 120 user-only candidate fixture, with counted omissions and intentionally empty AI half.
- `artifacts/promptprint-stress-assistant-desktop.png`, `artifacts/promptprint-stress-assistant-mobile.png`, `artifacts/promptprint-stress-assistant-export.png` — corresponding assistant-only fixture.

Remaining constraints: shared is a descriptive empirical-rate category, not a confidence/equivalence test. Content-token segmentation and the 80% containment rule are heuristic; exact 80% coverage still permits up to 20% independent uses to be represented by a compound. Dense/long labels can be omitted and global size floors can flatten low-end size differences. Phrase vocabulary discovery is bounded; the work-cap fallback uses words only and reports it. The observed period reflects available timestamps, not proof of complete export coverage. Chromium and synthetic demo/export-shaped fixtures were tested, including the existing 20,000-short-message race fixture; no user's real history was supplied, no real-history validation is claimed, and exhaustive Safari/Firefox/font/large-real-archive performance validation remains outside this evidence.

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
- Git was initialized and the initial commit `404b9d0` pushed to `https://github.com/31zuk1/bigwords` on `main`; the working tree was clean before the 2026-09-09 landing refinement;
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

### Simple landing and larger stacked actions (2026-09-09)

The owner explicitly rejected the rainbow headline/brand rules, colored decorative marks, dotted import frame, and small side-by-side buttons. This supersedes the earlier decorative landing direction.

- [x] Inspected the owner's three screenshots and the clean Git checkpoint `404b9d0`.
- [x] Replaced the two-column landing with a centered single-column composition, plain headline, and large vertically stacked demo/file actions; retained file-drop behavior without a permanent frame.
- [x] Removed matching decorative rainbow rules from the shared brand, analysis heading/toolbar, and PNG title so the rejected motif does not reappear later.
- [x] Inspected desktop, mobile, and 320 px layouts; ran existing checks and updated screenshot evidence.

The landing now uses neutral paper with the existing faint static grain. Redundant brand text, colored bars, the upload-icon tile, and the permanent import outline are gone. The short three-step explanation is monochrome. A temporary solid outline still identifies the drop target while dragging. The local-only privacy promise, supported formats, demo/import handlers, recovery diagnostics, semantic cloud colors, and restrained word hover remain intact.

Validation:

- `pnpm check`: PASS — strict TypeScript, zero-warning ESLint, 10 Vitest files / 61 tests, and production build (35 modules; CSS 34.17 kB / 7.61 kB gzip, app JS 243.25 kB / 77.68 kB gzip, worker 53.85 kB).
- `pnpm e2e`: PASS — 9/9 Chromium tests in 26.3 seconds, including import recovery, demo, context, PNG privacy, network/console guards, cancellation races, ultrawide boundaries, and mobile operation. The first sandboxed attempt could not bind port 4173 (`listen EPERM`); the approved elevated rerun passed without changing test expectations.
- Browser DOM measurements at 1440 × 1000, 390 × 844, and 320 × 800: action sizes were respectively 480 × 68, 358 × 64, and 288 × 64 px; both buttons shared their left/right bounds with a 12 px vertical gap. Document width exactly matched each viewport. The import border was `none`, as were the headline background and brand pseudo-element.
- The Playwright skill's optional CLI wrapper could not fetch its package inside the network sandbox (`ENOTFOUND registry.npmjs.org`); existing repository Playwright tests provided artifact evidence and CUA browser controls supplied responsive DOM measurements. The in-app browser's responsive screenshot capture was scaled/stitching-imperfect; desktop visual review used the unscaled test artifact. No application workaround was added for this capture issue, and temporary viewport overrides were reset.
- Regenerated all six existing PNG artifacts; visually inspected `artifacts/promptprint-landing.png`, `artifacts/promptprint-demo-full.png`, and `artifacts/promptprint-export.png`. The landing has no decorative rainbow strokes or import frame; analysis and export headings are plain while the visualization retains its semantic colors.
- `git diff --check`: PASS. The existing localhost:5173 preview served the revised landing through hot reload; its development server was left running.

### Viewport-centered landing and optical text alignment (2026-09-09)

The owner identified that the headline, copy, actions, and privacy line still did not read as one precisely centered composition. Preserve the preceding uncommitted simplification and correct alignment only.

- [x] Measured the existing live 713 × 584 viewport: the group occupied y=132–600.96 (center 366.48 vs viewport center 292), and the demo text center was 14 px right of the file button's text center. Header flow, asymmetric stage padding, and icon-inclusive centering caused these offsets; full-width terminal Japanese punctuation also leaves visible trailing space.
- [x] Centered the full landing group against the viewport with symmetric clearance and compact short-height spacing; extremely short windows scroll without clipping or header overlap.
- [x] Removed decorative action/privacy icons and trimmed only terminal punctuation's unused half-em so visible text follows the shared centerline.
- [x] Validated desktop, compact-height, and narrow layouts with live measurements, screenshot inspection, and the existing checks.

Implementation: the wordmark remains in its original top position but no longer consumes stage layout height. The stage uses `min-height: 100svh` and symmetric padding rather than a header-subtracted viewport and asymmetric padding. A 740 px height breakpoint reduces spacing/type without shrinking buttons below 64 px. Terminal punctuation stays visible and in the text content; the heading retains its canonical accessible name via `aria-label`. No import, analysis, export, or worker logic changed.

Validation evidence:

- Live browser measurements: group vertical-center error was at most 0.004 px at 1440 × 1000, 713 × 584, 1440 × 600, 390 × 844, and 320 × 800. At 390 × 844, both headline lines, both description lines, buttons, drop hint, and privacy row were horizontally centered within 0.004 px. The former 14 px demo-label offset is now zero.
- All measured viewports had document width equal to viewport width. At the deliberately extreme 568 × 320 size, the stage grows to 557.18 px with 76 px top clearance, leaving every item reachable by scrolling instead of vertically clipping the group or colliding with the wordmark. Temporary browser viewport overrides were reset.
- Final `pnpm check`: PASS — strict TypeScript, zero-warning ESLint, 10 Vitest files / 61 tests, and 35-module production build (CSS 34.30 kB / 7.66 kB gzip, app JS 243.30 kB / 77.60 kB gzip, worker 53.85 kB).
- Final `pnpm e2e`: PASS — 9/9 Chromium tests in 40.7 seconds, with existing network, console, import, context, export/privacy, cancellation, ultrawide, and mobile guards unchanged. The initial run found three failures because punctuation wrappers altered the inferred accessible heading name; the explicit canonical label fixed the implementation, without relaxing test assertions.
- Regenerated the existing screenshot artifacts and visually inspected the updated `artifacts/promptprint-landing.png`. Live geometry checks used the available CUA browser controls because the optional skill CLI remained unavailable as documented in the preceding entry; existing repository Playwright tests provided the screenshot evidence.
- `git diff --check`: PASS. The original localhost:5173 development server remains running and hot-reloaded with the correction.
