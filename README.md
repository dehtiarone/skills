# skills

[![test](https://github.com/dehtiarone/skills/actions/workflows/test.yml/badge.svg)](https://github.com/dehtiarone/skills/actions/workflows/test.yml)
[![license](https://img.shields.io/github/license/dehtiarone/skills)](LICENSE)
[![release](https://img.shields.io/github/v/release/dehtiarone/skills)](https://github.com/dehtiarone/skills/releases/latest)

Skills for AI agents. Each skill ships one variant per host, with the same behaviour and output.

| Skill                  | What it does                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `escalating-subagents` | Runs bug fixes, features and change requests through tiered discover / implement / validate subagents with bounded model escalation. |

## Layout

```text
claude/skills/<skill>/SKILL.md   Claude Code
codex/skills/<skill>/SKILL.md    Codex
test/<skill>.test.mjs            keeps both variants in step
```

## Requirements

- Bash 3.2+ and Git 2.31+
- macOS or Linux; Windows only via WSL

## Install

Claude Code, for all projects:

```bash
cp -r claude/skills/escalating-subagents ~/.claude/skills/
```

Codex, for all projects:

```bash
cp -r codex/skills/escalating-subagents ~/.agents/skills/
```

For one project only, copy into that repository's `.claude/skills/` or `.agents/skills/` instead. For claude.ai, zip the `escalating-subagents` folder and upload it.

## Test

Requires Node 22+ in addition to the requirements above; no dependencies.

```bash
node --test
```

The tests check that both variants embed the same snapshot script, that its pinned SHA-256 and extraction command are correct, that the variants differ only in host-specific lines, and that the script itself behaves correctly.

## License

MIT
