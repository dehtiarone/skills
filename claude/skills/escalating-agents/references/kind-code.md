# Kind: code change

Load for a code task in tier C or D.

- The workspace is the repository root. Owned outputs are file globs; `*` also matches `/`.
- Map items: where the behaviour lives, how it is tested, which instruction files (`AGENTS.md`, `CLAUDE.md`, specifications) apply and what they require, and which side effects items could share: generated files, schemas or migrations, databases, ports, caches, fixtures, CI configuration. Items that share a side effect get `after:` so they run one after another.
- Criteria: `behavioral` for anything that can be exercised by a test, build or run; `static` for type-check or lint; `parse` and `format` only for what they literally check; `inspection` only for what cannot be executed. Name the repository's own test command as the criterion's `check:` when the request or a map report gives one.
- Never accept a unit test in place of required integration, end-to-end, visual or device evidence. A required check that cannot run is reported as not run.
- Put production-data constraints (live data, additive-only changes) into a `decision` line so every brief carries them.
- Committing, pushing or opening a pull request is yours to do, and only when the user asked for it and the repository's rules allow it; record it with `--external`.
