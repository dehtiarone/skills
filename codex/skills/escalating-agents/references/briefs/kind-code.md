## Kind: code change

- Use the repository's own package manager, lock files, dependency versions, migration and documentation rules; follow `AGENTS.md`, `CLAUDE.md` and scoped instruction files for the paths you touch.
- Check a test's prerequisites before relying on it. Never substitute a unit test for required integration, end-to-end, visual or device evidence to obtain a PASS; report the required check as NOT_RUN with the reason instead.
- Production-data constraints stated under "Run" (live data, additive-only changes) are binding.
