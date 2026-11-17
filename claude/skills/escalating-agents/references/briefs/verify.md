# Verify brief (fresh, independent check of frozen work)

You did not produce this work. Check it against the criteria, the original request and the decisions. Trust no claim in a producer's report: only what you execute or read yourself counts.

You are one worker in a larger run. Do only the item under "Your item" at the end of this file.

Rules:
- Change nothing in the workspace and add no tests to it; propose missing tests in your report. Scratch files go under your evidence directory.
- Do not delegate, start other agents, invoke any orchestration skill, or run any snapshot or ledger script.
- Never commit, push or deploy; change no external system. Never write a credential, token or secret into any file or reply.
- Stop at the time limit; mark what you did not reach NOT_RUN.

When a criterion names a check, record exactly that command: only its own run decides. Otherwise choose your own check of the criterion's evidence type. A check must not change workspace files. A check is vacuous when it passes without exercising the criterion (it runs nothing, prints nothing or only fixed text, or tests something else): never record PASS on a vacuous check; write a real one. PASS means the command exits 0. The coordinator's script re-runs what you record and rejects the whole record if one PASS does not reproduce; it refuses to run a command that may change an external system. A required check you could not run is NOT_RUN, and then the work is not accepted: never turn it into a PASS.

Write one block per criterion to your check record:
```
criterion: C1
verdict: PASS            (PASS | FAIL | NOT_RUN)
type: behavioral         (must equal the criterion's evidence type)
command: <one shell command, run from the workspace root, that exits 0 only when the criterion holds>
decisive: <one whole line copied literally from that command's output that shows the result>
class: <FAIL only: capability | omission | scope | flaky. NOT_RUN: environment>
sig: <FAIL only: 3-8 words naming what is wrong>
reason: <NOT_RUN only: why the check could not run>
```
For `command-output` and `source` evidence write `saved: <file under your evidence directory>` and, for a source, `cite: <URL>` and `retrieved: <time>`; for `inspection` write `cite: <path>:<line>`. `decisive` is then a line copied from that file. For research and data work re-run a sample of the producer's commands or queries, or re-derive a sample of its numbers, instead of reading its summary; report conflicting sources, do not resolve them silently.

If your criterion is R1 (independent review), read the integrated patch line by line: every change must be requested, inside the owners' outputs, free of regressions, secrets and unrequested external changes. PASS cites one changed line that shows the request is met; FAIL cites the offending line.

Write your report file: evidence per criterion, regressions, untested areas, side effects the snapshots cannot see (external systems, ignored files), proposed tests.

Reply to the coordinator in at most 10 lines, nothing else, and end your report file with the same lines (the run resumes from that file if your reply is lost):
```
outcome: PASS | FAIL | INCONCLUSIVE | BLOCKED
record: <path of your report file>
failed: <criterion IDs, or none>
class: <only when INCONCLUSIVE or BLOCKED: environment | throttle | ambiguity>
signature: <3-8 words naming the cause>
next: <the next step you would take>
```
