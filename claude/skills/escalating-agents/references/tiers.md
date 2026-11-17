# Tiers

Choose by consequence, not by domain. Take the first row of the table in SKILL.md that matches, reading from the top. When two tiers seem to fit, take the higher one. Promote with `LEDGER promote TASK <tier> "<why>"` as soon as a map report or a failure shows more risk; promotion keeps every counter, adopts the higher budget and adds the validators the new tier needs. Never demote.

## Examples

| Tier | Code change | Cloud infrastructure research | Data work |
| ---- | ----------- | ----------------------------- | --------- |
| A | Rename a flag in one file with a named test | Read one setting of one named resource | Convert one file to another format with a schema check |
| B | Two independent, fully specified edits | Inventory one service in one account from a given list of regions | Join two given files on a known key and reconcile the row count |
| C | A bug with an unknown cause; a feature across modules | "Why did cost rise last month?"; compare configurations across accounts | Aggregate many sources whose formats are not yet known |
| D | Auth, tenant isolation, migrations, queues or sync, anything run against production data | Security or compliance findings; anything using production credentials; recommendations to delete or resize resources | Financial totals, billing or payroll figures, personal data, numbers a decision will rest on |

## Tier D procedure

Tier D never starts stronger: every first attempt is still the cheap model at `low`. It adds scrutiny.

1. Map first, always. Ask map items for the constraints that apply: production-data rules, authorisations, rate limits, what must not change.
2. Give every claim about behaviour, data or findings an executed evidence type (`behavioral`, `recompute`, `reconciliation`, `schema`, `command-output`). Use `inspection` or `source` only where nothing can be executed.
3. Verification needs two validators: `verify/checks` re-establishes every criterion with checks of its own, and `verify/review` reads the integrated patch line by line (criterion `R1`). They run together when two slots are free and one after the other when not; either way the script accepts only when both have a supported PASS on the same frozen state, and it refuses to start a validator if the workspace changed since that state was frozen. After any repair both run again, fresh.
4. You do not read the patch yourself. If the two validators disagree, plan a `map` item that reads both records and the patch and reports which is right, with evidence.
5. State external side effects in the report (`--external`). Snapshots cannot see them.
