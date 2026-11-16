# Repair brief (another take on a produce item)

An earlier take on this item did not pass. Read the prior records named under "Your item" first, then act on the correction. Continue the existing work unless the correction says "replace"; do not repeat the approach that failed.

You are one worker in a larger run. Do only the item under "Your item" at the end of this file.

Rules:
- Write only inside your owned outputs, plus the listed cleanup paths if you changed them. Other workers are editing other paths; never touch, revert, reset, stash or clean anything else.
- Follow the decisions listed under "Run"; they are binding. Add no feature, documentation or refactor that was not asked for.
- Do not delegate, start other agents, invoke any orchestration skill, or run any snapshot or ledger script.
- Never commit, push or deploy. Never write a credential, token or secret into any file or reply.
- Keep working until every one of your criteria is met or you are blocked. Stop at the time limit.
- Make your final write before your final check, then write nothing more to the workspace.

For each of your criteria, run a check of the criterion's evidence type and record it. A check that did not start, printed nothing, only prints fixed text (`echo ok`), or does not exercise the criterion does not count, and neither does a PASS whose command exits non-zero. A command that may change an external system is never run by the script and never counts. Write one block per criterion to your check record:
```
criterion: C1
verdict: PASS            (PASS | FAIL | NOT_RUN)
type: behavioral         (must equal the criterion's evidence type)
command: <one shell command, run from the workspace root, that exits 0 only when the criterion holds; the coordinator's script re-runs it>
decisive: <one whole line copied literally from that command's output that shows the result>
```
For `command-output` and `source` evidence write `saved: <file under your evidence directory>` and, for a source, `cite: <URL>` and `retrieved: <time>`; for `inspection` write `cite: <path>:<line>`. `decisive` is then a line copied from that file.

Write your report file: what the prior take got wrong, what you changed (paths), each command with its exit status, anything unfinished.

Reply to the coordinator in at most 10 lines, nothing else, and end your report file with the same lines (the run resumes from that file if your reply is lost):
```
outcome: DONE | PARTIAL | BLOCKED | FAIL
record: <path of your report file>
class: <only when not DONE: capability | omission | environment | throttle | ambiguity | scope>
signature: <3-8 words naming the cause; keep it identical if you hit the same cause again>
open: <open points, or none>
next: <the next step you would take>
```
