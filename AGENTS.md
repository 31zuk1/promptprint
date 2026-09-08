# Promptprint repository instructions

## Mission

Build a trustworthy, browser-only proof of concept named **Promptprint**. It visualizes the lexical exchange between a human and AI, with user-dominant terms on the left, shared terms in the center, and AI-dominant terms on the right. A visible, testable end-to-end product takes priority over speculative architecture or perfect NLP.

## Source of truth

Before changing implementation code, read:

- `docs/PRODUCT_SPEC.md`
- `docs/TECHNICAL_SPEC.md`
- `docs/ACCEPTANCE.md`
- `.agent/PLANS.md`
- `docs/EXECPLAN.md`

Use the product specification to resolve product behavior, the technical specification for implementation constraints, and the acceptance criteria for completion. Keep `docs/EXECPLAN.md` synchronized with meaningful discoveries, decisions, milestones, and validation evidence.

## Scope

Required:

- static React and TypeScript application;
- synthetic demo mode;
- local ZIP and JSON import;
- robust ChatGPT adapter and experimental Claude adapter;
- deterministic local analysis and Mirror Cloud layout;
- context exploration, filters, insights, PNG export, and data clearing;
- unit tests, browser tests, documentation, and a Playwright screenshot.

Out of scope:

- backend services, accounts, authentication, cloud sync, or databases;
- browser extensions or native mobile applications;
- paid APIs, external LLM calls, embeddings, or remote topic models;
- social sharing, collaboration, billing, or perfect support for every historical export schema;
- personality, mental-health, or causal diagnosis.

## Privacy and security

- Imported conversation data must remain in the browser process.
- Do not add analytics, telemetry, remote error reporting, remote fonts, CDN runtime scripts, or third-party runtime requests.
- Do not persist raw imported messages in `localStorage`, IndexedDB, cookies, service-worker caches, or another durable store.
- A share image must not contain raw excerpts, conversation titles, email addresses, or hidden terms.
- Keep a visible `解析データを消去` action that terminates active work and releases in-memory state and object URLs.
- Treat JSON and ZIP contents as untrusted input. Validate shapes, cap work, avoid leaking private values in diagnostics, and fail with actionable Japanese messages.

## Engineering conventions

- Use Vite, React, strict TypeScript, pnpm, Vitest, Testing Library, ESLint, and Playwright.
- Keep the application static and deployable from `dist/`.
- Prefer browser-native APIs and small dependencies. Explain non-trivial production dependencies in `docs/ARCHITECTURE.md`.
- Use `unknown` and explicit type guards at file boundaries; avoid broad `any`.
- Run parsing and analysis that can block rendering in a Web Worker.
- Keep original message text separate from cleaned analysis text.
- Use message-document frequency and role-normalized rates as primary statistics; raw token counts may only break ties.
- Keep analysis and layout deterministic for identical data and settings.
- Demo conversations must enter through the same normalization and analysis path as imported conversations.
- All primary user-facing copy is Japanese. English identifiers and technical prose are acceptable where clearer.
- Preserve keyboard access, visible focus, semantic controls, Enter activation for terms, and Escape-to-close behavior.
- Do not make causal claims about AI-first terms or value judgments about the Echo rate.

## Import rules

- ChatGPT graph exports must use the selected/current branch rather than aggregating all branches.
- Exclude system, developer, context, tool, execution-output, empty, and non-text messages.
- Claude support is conservative and explicitly experimental. Unsupported shapes return safe diagnostics rather than crashing.
- Original text may be retained only in volatile application memory for the context view. Tokenization uses cleaned text.

## Required scripts and checks

The completed repository exposes:

- `pnpm dev`
- `pnpm build`
- `pnpm preview`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm e2e`
- `pnpm check`

Before declaring work complete, run the relevant checks and record exact results in `docs/EXECPLAN.md`. Final end-to-end evidence includes `artifacts/promptprint-demo.png`, an unexpected-network-host guard, and a browser-console error guard.

## Working agreement

- Inspect existing work before editing and preserve unrelated changes.
- Prefer the simplest robust implementation that satisfies every mandatory acceptance criterion.
- Build a thin end-to-end path first, then improve parsing accuracy, appearance, accessibility, and test depth.
- Keep parser and analysis functions pure where practical and cover boundary behavior with small fixtures.
- Record unexpected export shapes, browser constraints, performance tradeoffs, and recovery instructions in the ExecPlan.
- Do not silently weaken a mandatory acceptance criterion. Document any environment-only blocker with reproduction steps and alternative evidence.

