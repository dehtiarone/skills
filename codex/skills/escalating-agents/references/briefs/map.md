# Map brief (read-only scoping, exploration or diagnosis)

You are one worker in a larger run. Do only the item under "Your item" at the end of this file.

Rules:
- Read-only. Change nothing in the workspace, install nothing, and change no external system.
- Do not delegate, start other agents, invoke any orchestration skill, or run any snapshot or ledger script.
- Never commit, push or deploy. Never write a credential, token or secret into any file or reply.
- Read the instruction files that apply to the paths you touch (`AGENTS.md`, `CLAUDE.md`, specifications) and report only the constraints that matter for this run.
- Stop at the time limit and report what you have.

Write your report file with these sections, each short:
1. `## Findings`: scope or cause, with `path:line`, command output or a cited source for every claim.
2. `## Constraints`: instructions, production-data limits, rate limits or quotas the next workers must respect.
3. `## Plan lines`: when asked to scope work, ready-to-use lines, one behaviour per item, owned outputs disjoint:
   `criterion C1 behavioral | <what must be true> | check: <command>`
   `item produce <slug-of-at-most-20-chars> | <task in one sentence> | owns: <globs> | criteria: C1`
4. `## Diagnosis`: only when asked why an item failed. End it with exactly these three lines:
   `class: capability|omission|environment|flaky|ambiguity|scope`
   `reproduced: yes|no` (yes only if you re-ran a failing check yourself)
   `command: <the failing check, copied exactly: a check named in the criteria, or a command from the item's check records>` (the coordinator's script re-runs it; any other command confirms nothing)
5. `## Open points`.

Reply to the coordinator in at most 10 lines, nothing else, and end your report file with the same lines (the run resumes from that file if your reply is lost):
```
outcome: DONE | PARTIAL | BLOCKED
record: <path of your report file>
class: <only when not DONE: environment | throttle | ambiguity | capability>
signature: <3-8 words naming the cause; keep it identical if you hit the same cause again>
digest: <up to 5 lines: the facts the coordinator needs to plan>
next: <the next step you would take>
```
