import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { it } from 'node:test';
import { describeHelperSuite, frontmatterSuite, loadPair, pairSuite, repoRoot } from '../test-support/skill-pair.mjs';

const skills = loadPair('cheap-parallel-agents');
const sibling = loadPair('escalating-subagents');

// Host-specific lines: Claude-only frontmatter, compatibility, title, coordinator paragraph, ladder
// header and rows, skipped levels, preflight and dispatch paragraphs, and the model in the progress example.
pairSuite(skills, {
  dropLine:
    /^(disable-model-invocation: |argument-hint: |compatibility: |# Cheap parallel agents for |Assumed coordinator: |\| Rung \||\| ---- \| ---|\| [0-3] +\| `|Skipped levels: |Preflight \((Claude Code|Codex)\): |Dispatch \((Claude Code|Codex)\): )/,
  normalize: [[/ · rung 1 \([^)]*\) · /, ' · rung 1 (MODEL) · ']],
});

frontmatterSuite(skills);

it('shares one byte-identical snapshot script with escalating-subagents', () => {
  for (const entry of [...skills, ...sibling]) {
    assert.equal(entry.script, skills[0].script, `${entry.host}/${entry.skill}: script differs`);
  }
});

it('is explicit-only and points at escalating-subagents for an ordinary change', () => {
  for (const { host, document } of skills) {
    assert.match(document, /^description: .*escalating-subagents is the usual choice\.$/m, `${host}: description`);
    assert.match(
      document,
      /^Invocation: this skill runs only when the user invokes it by name; it is never applied automatically\.[^\n]*`escalating-subagents`[^\n]*before dispatching\.$/m,
      `${host}: invocation paragraph`,
    );
  }
});

it('gives both escalating-subagents variants the identical invocation paragraph naming this skill', () => {
  const sentence = /^Invocation: this skill runs only when the user invokes it by name[^\n]*`cheap-parallel-agents`[^\n]*before dispatching\.$/m;
  const found = sibling.map(({ document }) => document.match(sentence)?.[0]);
  assert.ok(found[0], 'claude: invocation paragraph');
  assert.equal(found[1], found[0], 'codex: identical invocation paragraph');
});

it('admits batches against the full reserve, guards the final repair cycle, and headers every brief', () => {
  for (const { host, document } of skills) {
    assert.match(document, /`remaining ≥ M \+ U \+ V \+ \(1 \+ V\)`/, `${host}: admission counts map shards`);
    assert.match(document, /when `remaining < 1 \+ V`, stop and report the failed items unresolved/, `${host}: repair guard`);
    assert.match(document, /Validator retries \(unsupported PASS, INCONCLUSIVE\) spend reserve calls/, `${host}: validator retries`);
    assert.match(document, /begins with the literal header line `Stage: <Map\|Implement\|Validate> \| Item: <id> \| Attempt: <k> \| Rung: <n>`/, `${host}: brief header`);
    assert.match(document, /dispatched together and awaited together, and no repair starts until every one of them has returned/, `${host}: barrier`);
    assert.match(document, /as literal absolute paths, never through shell variables/, `${host}: literal helper paths`);
    assert.match(document, /capture `post-N` and check `names0 pre-N post-N` against that batch's ownership \(empty for a map batch\) before dispatching anything else/, `${host}: per-batch scope check`);
    assert.match(document, /`names0 post-N pre-N\+1` must also be empty/, `${host}: no change between batches`);
    assert.match(document, /written to `TASK\/evidence\/integrated-post-N\.patch`, for validators and for the coordinator's own reading/, `${host}: patch file`);
  }
});

it('keeps the README ladder numbers equal to the preserved evidence rows', () => {
  const readme = readFileSync(join(repoRoot, 'README.md'), 'utf8');
  const evidence = readFileSync(join(repoRoot, 'docs/evidence/frontiercode-2026-11-07.md'), 'utf8');
  const cited = [...readme.matchAll(/\| (Haiku 5\.5|GPT-6 Luna) +\|([^\n]*)\|/g)];
  assert.equal(cited.length, 2, 'README cites one row per worker model');
  for (const [, model, cells] of cited) {
    for (const value of cells.match(/\.\d{4}|\$\d+\.\d+/g) ?? []) {
      assert.ok(evidence.includes(value), `${model}: ${value} appears in docs/evidence`);
    }
  }
});

describeHelperSuite(skills);
