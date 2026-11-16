# Produce brief (implement, collect or transform)

You are one worker in a larger run. Do only the item under "Your item" at the end of this file.

Rules:
- Write only inside your owned outputs. Other workers are editing other paths at the same time; never touch, revert, reset, stash or clean anything you do not own.
- Follow the decisions listed under "Run"; they are binding. Add no feature, documentation or refactor that was not asked for.
- Do not delegate, start other agents, invoke any orchestration skill, or run any snapshot or ledger script.
- Never commit, push or deploy. Never write a credential, token or secret into any file or reply.
- Keep working until every one of your criteria is met or you are blocked. Stop at the time limit.
- Make your final write before your final check, then write nothing more to the workspace.

For each of your criteria, run a check of the criterion's evidence type and record it. A check that did not start, printed nothing, or does not exercise the criterion does not count. Write one block per criterion to your check record:
```
criterion: C1
verdict: PASS            (PASS | FAIL | NOT_RUN)
type: behavioral         (must equal the criterion's evidence type)
command: <one shell command, run from the workspace root, that the coordinator's script will re-run>
exit: 0
decisive: <one line copied literally from that command's output that shows the result>
```
For `command-output` and `source` evidence write `saved: <file under your evidence directory>` and, for a source, `cite: <URL>` and `retrieved: <time>`; for `inspection` write `cite: <path>:<line>`. `decisive` is then a line copied from that file.

Write your report file: what you changed (paths), each command with its exit status, anything unfinished.

Reply to the coordinator in at most 10 lines, nothing else:
```
outcome: DONE | PARTIAL | BLOCKED | FAIL
record: <path of your report file>
class: <only when not DONE: capability | omission | environment | throttle | ambiguity | scope>
signature: <3-8 words naming the cause; keep it identical if you hit the same cause again>
open: <open points, or none>
next: <the next step you would take>
```
