# Execution plans for long-running work

`docs/EXECPLAN.md` is a living, restartable implementation document. It must remain useful to a developer who has only the repository and no previous conversation context.

## Required contents

The ExecPlan must include:

1. **Purpose and visible outcome** — what a user can see and do when the work is complete.
2. **Current repository state** — relevant files, runtime and package-manager versions, Git state, constraints, and discoveries.
3. **Progress checklist** — timestamped completed and pending work.
4. **Milestones** — each ending in observable behavior, not only code structure.
5. **Validation** — commands, fixtures, browser flows, expected evidence, and actual outcomes.
6. **Decision log** — choices, alternatives considered, and rationale.
7. **Unexpected findings** — export shapes, browser limitations, package issues, and performance observations.
8. **Recovery instructions** — current state, next concrete task, blockers, and commands needed to resume.

## Maintenance rules

- Update the plan before implementation begins and continue into implementation.
- Synchronize it after every meaningful milestone or change in direction.
- When repository reality differs from the plan, update the plan and record why.
- A milestone is complete only when its user-visible behavior has evidence.
- Prefer executable proof: tests, screenshots, console checks, downloads, and reproducible commands.
- At completion, reconcile the plan against `docs/ACCEPTANCE.md` and list any remaining limitations honestly.

## Progress entry format

Use local ISO-8601 timestamps and keep status explicit:

```md
- [x] 2026-09-04T23:40:04+09:00 — Inspected the initial repository and recorded tool versions.
- [ ] Implement the next observable milestone.
```

## Decision entry format

```md
- 2026-09-04 — **Decision:** concise statement.
  **Reason:** evidence and tradeoff.
  **Alternative:** rejected option and why.
```

## Validation entry format

```md
| Date | Command or flow | Result | Evidence / notes |
| --- | --- | --- | --- |
| 2026-09-04 | `pnpm typecheck` | PASS | Exit status 0 |
```

Do not summarize unexecuted checks as passing. If a check cannot run, record the exact blocker, reproduction steps, and any narrower alternative verification.

