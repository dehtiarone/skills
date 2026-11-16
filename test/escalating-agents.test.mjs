// Keeps the two host variants of escalating-agents in step with each other, with the script's
// numbers, with the README and with docs/evidence, and guards the context-size ceilings.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  assertSharedText,
  execute,
  frontmatterSuite,
  listFiles,
  loadPair,
  parseFrontmatter,
  parseYamlSubset,
  repoRoot,
  skillDir,
  success,
} from '../test-support/skill-pair.mjs';

const skills = loadPair();
const [claude, codex] = skills;
const read = (host, file) => readFileSync(join(skillDir(host), file), 'utf8');

// The complete list of host-specific files. Everything else must be byte-identical.
const hostSpecificFiles = new Set(['SKILL.md', 'references/pinning.md', 'agents/openai.yaml']);

// Host-specific SKILL.md content, enumerated. Lines that are wholly host-specific are dropped; lines
// that mix a host identifier with a shared rule are normalised, so the shared part is still compared.
const sharedRules = {
  dropLine: /^(disable-model-invocation: |argument-hint: |allowed-tools: |compatibility: |# Escalating agents for |\| [A-D] +\| \d+ +\| \d+ +\| \d+ +\|$|For each `dispatch` block )/,
  normalize: [
    [/ {2,}/g, ' '],
    [/-{3,}/g, '---'],
    [/^`LEDGER` below means .*?\. Run it;/, '`LEDGER` below means PATH. Run it;'],
    [/--host (claude|codex) /, '--host HOST '],
    [/^\| Level \| Model \| `(?:reasoning_)?effort` \|/, '| Level | Model | EFFORT |'],
    [/^\| ([1-4]) \| `[^`]+` \| `(low|medium|high)` \| /, '| $1 | MODEL | `$2` | '],
    [/a level 4 call \d+\./, 'a level 4 call N.'],
    [/^## Dispatch \(.*\)$/, '## Dispatch (HOST)'],
  ],
};
// Sentences of the host-specific Dispatch paragraph that must read the same on both hosts.
const sharedDispatchSentences = [
  'Blocks that say `barrier=yes` are validators:',
  'make no other tool call until every one of them has returned, so a verification cycle returns whole',
  '`continue=same-worker` means:',
  'run `LEDGER defer TASK <the refused items>`',
  'If the host shows the model or effort a worker really ran on, add `--ran <model>/<effort>` to its `result`.',
  'read `references/pinning.md`.',
];
const hostTokens = {
  claude: {
    required: ['`Agent`', 'subagent_type: "general-purpose"', '`SendMessage`', 'Concurrent subagent limit reached', 'subagent_type: "fork"', '`Explore`', '`run_in_background`', '--host claude'],
    forbidden: /spawn_agent|reasoning_effort|fork_turns|followup_task|wait_agent|task_name|--slots <free|gpt-6|--host codex/,
  },
  codex: {
    required: ['`spawn_agent`', '`task_name`', '`reasoning_effort`', 'fork_turns: "none"', '`wait_agent`', '`followup_task`', '--slots <free slots>', 'A parent at `ultra`', '--host codex'],
    forbidden: /subagent_type|SendMessage|run_in_background|`Agent`|CLAUDE_|\bhaiku\b|\bsonnet\b|Concurrent subagent limit|--host claude/,
  },
};

const numbers = (host) => {
  const out = success(execute('bash', [join(skillDir(host), 'scripts', 'ledger.sh'), 'numbers', host], repoRoot));
  const tiers = {};
  for (const line of out.split('\n')) {
    const fields = Object.fromEntries(line.split(' ').slice(1).map((pair) => pair.split('=')));
    if (fields.tier) tiers[fields.tier] = fields;
    else tiers.ladder = fields;
  }
  return tiers;
};

describe('one methodology, two hosts', () => {
  it('ships byte-identical files on both hosts apart from the enumerated host-specific ones', () => {
    const claudeFiles = listFiles(claude.dir);
    const codexFiles = listFiles(codex.dir);
    assert.deepEqual(claudeFiles, codexFiles.filter((file) => file !== 'agents/openai.yaml'));
    assert.ok(codexFiles.includes('agents/openai.yaml'));
    for (const file of claudeFiles) {
      if (hostSpecificFiles.has(file)) continue;
      assert.ok(readFileSync(join(claude.dir, file)).equals(readFileSync(join(codex.dir, file))), `${file} differs between hosts`);
    }
    for (const file of ['scripts/ledger.sh', 'scripts/agent-snapshot.sh', 'references/briefs/map.md', 'references/briefs/produce.md', 'references/briefs/repair.md', 'references/briefs/escalated.md', 'references/briefs/verify.md']) {
      assert.ok(claudeFiles.includes(file), `${file} is shipped`);
    }
  });

  it('keeps SKILL.md identical outside the enumerated host-specific content', () => {
    assertSharedText(skills, sharedRules);
    for (const { host, document } of skills) {
      const dropped = document.split('\n').filter((line) => sharedRules.dropLine.test(line));
      assert.ok(dropped.length <= 10, `${host}: ${dropped.length} wholly host-specific lines`);
      const dispatch = document.split('\n').find((line) => line.startsWith('For each `dispatch` block '));
      assert.ok(dispatch, `${host}: Dispatch paragraph`);
      for (const sentence of sharedDispatchSentences) assert.ok(dispatch.includes(sentence), `${host}: Dispatch says: ${sentence}`);
    }
    const sections = (document) => document.split('\n').filter((line) => line.startsWith('## ')).map((line) => line.replace(/ \(.*\)$/, ''));
    assert.deepEqual(sections(codex.document), sections(claude.document), 'same section order');
  });

  it('names only its own host\'s tools, parameters and models', () => {
    for (const { host, document } of skills) {
      const pinning = read(host, 'references/pinning.md');
      for (const token of hostTokens[host].required) assert.ok(document.includes(token), `${host}: SKILL.md names ${token}`);
      assert.doesNotMatch(document, hostTokens[host].forbidden, `${host}: SKILL.md names another host's identifier`);
      assert.doesNotMatch(pinning, hostTokens[host].forbidden, `${host}: pinning.md names another host's identifier`);
      assert.match(pinning, /LEDGER pinning TASK mismatch/, `${host}: pinning.md says how to record a mismatch`);
    }
    // The verdict paragraph is shared wording inside a host-specific file.
    const verdicts = (host) => read(host, 'references/pinning.md').split('\n').find((line) => line.startsWith('Every call has three facts'));
    assert.ok(verdicts('claude'));
    assert.equal(verdicts('codex'), verdicts('claude'));
  });

  it('replaces both earlier skills and states no sibling rule', () => {
    for (const host of ['claude', 'codex']) {
      assert.deepEqual(listFiles(join(repoRoot, host, 'skills')).map((file) => file.split('/')[0]).filter((name, i, all) => all.indexOf(name) === i), ['escalating-agents']);
    }
    for (const { host, document } of skills) {
      assert.doesNotMatch(document, /escalating-subagents|cheap-parallel-agents|ask which/i, `${host}: no sibling skill`);
      assert.match(document, /^This skill runs only when the user invokes it by name\./m, `${host}: explicit-only`);
    }
  });
});

frontmatterSuite(skills);

describe('frontmatter and host metadata', () => {
  it('follows each host\'s own conventions', () => {
    const fm = parseFrontmatter(claude.document).frontmatter;
    assert.equal(fm['allowed-tools'], 'Bash(${CLAUDE_SKILL_DIR}/scripts/ledger.sh *) Bash(bash ${CLAUDE_SKILL_DIR}/scripts/ledger.sh *)');
    assert.match(claude.document, /`\$\{CLAUDE_SKILL_DIR\}\/scripts\/ledger\.sh`/);
    assert.equal(parseFrontmatter(codex.document).frontmatter['allowed-tools'], undefined);
    assert.doesNotMatch(codex.document, /CLAUDE_SKILL_DIR/);
    const policy = parseYamlSubset(read('codex', 'agents/openai.yaml'));
    const short = policy.interface.short_description;
    assert.ok(short.length >= 25 && short.length <= 64, `short_description is ${short.length} characters`);
    assert.match(policy.interface.default_prompt, /\$escalating-agents\b/);
    for (const { host, document } of skills) {
      const { frontmatter } = parseFrontmatter(document);
      assert.equal(frontmatter.metadata.version, '2.0.0', `${host}: version`);
      assert.match(frontmatter.description, /code change.*cloud-infrastructure.*data aggregation/, `${host}: names all three kinds`);
      assert.doesNotMatch(frontmatter.description, /\b(I|you|your)\b/i, `${host}: third person`);
    }
    const manifest = JSON.parse(readFileSync(join(repoRoot, 'claude/.claude-plugin/plugin.json'), 'utf8'));
    assert.equal(manifest.version, '2.0.0');
    assert.match(readFileSync(join(repoRoot, 'CHANGELOG.md'), 'utf8'), /^## 2\.0\.0 /m);
  });

  it('ships executable scripts that parse', () => {
    for (const { host, dir } of skills) {
      for (const name of ['ledger.sh', 'agent-snapshot.sh']) {
        const path = join(dir, 'scripts', name);
        assert.ok(statSync(path).mode & 0o100, `${host}/${name} is executable`);
        success(execute('bash', ['-n', path], repoRoot));
      }
    }
  });
});

describe('ladder rules', () => {
  const ladderRows = (document) => [...document.matchAll(/^\| ([1-4]) +\| `([^`]+)` +\| `([a-z]+)` +\|/gm)].map(([, level, model, effort]) => `${level}:${model}/${effort}`);

  it('lists only the two worker models per host, at low, medium and high', () => {
    assert.deepEqual(ladderRows(claude.document), ['1:haiku/low', '2:haiku/medium', '3:haiku/high', '4:sonnet/high']);
    assert.deepEqual(ladderRows(codex.document), ['1:gpt-6-luna/low', '2:gpt-6-luna/medium', '3:gpt-6-luna/high', '4:gpt-6.1-terra/high']);
    for (const host of ['claude', 'codex']) {
      const n = numbers(host);
      assert.equal(n.ladder.ladder_produce, 'c:low,c:medium,c:high,x:high', `${host}: produce ladder`);
      assert.equal(n.ladder.ladder_support, 'c:low,c:medium,c:high', `${host}: validators and map items never reach the expensive model`);
      assert.deepEqual([n.A.cheap, n.A.expensive], host === 'claude' ? ['haiku', 'sonnet'] : ['gpt-6-luna', 'gpt-6.1-terra']);
    }
  });

  it('never names a forbidden worker model or an effort outside low to high in any shipped file', () => {
    for (const { host, dir } of skills) {
      for (const file of listFiles(dir)) {
        const text = readFileSync(join(dir, file), 'utf8');
        assert.doesNotMatch(text, /\b(opus|fable|mythos|astra)\b|gpt-6\.1-sol|gpt-6-sol/i, `${host}/${file}: forbidden model`);
        const efforts = text
          .split('\n')
          // The parent's own effort is the user's business; the skill may mention an `ultra` parent.
          .filter((line) => !/parent (at|runs at) `ultra`/.test(line))
          .join('\n');
        assert.doesNotMatch(efforts, /`(xhigh|max|ultra|minimal|none)`|effort[= ]+(xhigh|max|ultra|minimal|none)\b/, `${host}/${file}: effort outside low to high`);
      }
    }
  });

  it('says in both variants that every first attempt is cheap and low and that nobody predicts difficulty', () => {
    for (const { host, document } of skills) {
      assert.match(document, /\*\*Every first attempt is the cheap model at `low` effort\*\*, in every tier and stage, validators included\./, `${host}: first dispatch is cheap`);
      assert.match(document, /Never choose a model or effort, and never estimate how hard an item is: results move an item up, predictions do not\./, `${host}: no complexity guessing`);
      assert.match(document, /\*\*The expensive model is used only after `LEDGER gate` prints a `model` line for that item\.\*\*/, `${host}: gate`);
      assert.match(document, /Tier D gets more scrutiny, never a stronger first attempt\./, `${host}: tier D`);
      assert.match(document, /weaker evidence never satisfies a stronger criterion/, `${host}: evidence strength`);
      assert.match(document, /\*\*State lives in `TASK`, not in your memory\.\*\*/, `${host}: resume from disk`);
    }
  });
});

describe('numbers', () => {
  const tableRows = (document) => Object.fromEntries([...document.matchAll(/^\| ([A-D]) +\| (\d+) +\| (\d+) +\| (\d+) +\|$/gm)].map(([, tier, budget, produce, support]) => [tier, { budget, produce, support }]));

  it('prints the same budgets, take limits and weight in SKILL.md as the script uses', () => {
    for (const { host, document } of skills) {
      const n = numbers(host);
      const rows = tableRows(document);
      for (const tier of ['A', 'B', 'C', 'D']) {
        assert.deepEqual(rows[tier], { budget: n[tier].budget, produce: n[tier].takes_produce, support: n[tier].takes_support }, `${host} tier ${tier}`);
      }
      assert.match(document, new RegExp(`A cheap call costs 1 unit and a level 4 call ${n.A.expensive_units}\\.`), `${host}: weight`);
      assert.match(document, new RegExp(`the host's free slots, ${n.A.writer_ceiling} writers,`), `${host}: writer ceiling`);
    }
  });

  it('keeps Claude budgets at least twice the 1.2.0 cheap-skill budgets', () => {
    const n = numbers('claude');
    for (const [tier, old] of Object.entries({ A: 3, B: 7, C: 10, D: 12 })) {
      assert.ok(Number(n[tier].budget) >= 2 * old, `tier ${tier}: ${n[tier].budget} ≥ ${2 * old}`);
    }
  });

  it('keeps every Codex budget and take limit within 1.5 to 2.0 times the Claude value', () => {
    const a = numbers('claude');
    const b = numbers('codex');
    for (const tier of ['A', 'B', 'C', 'D']) {
      for (const key of ['budget', 'takes_produce', 'takes_support']) {
        const factor = Number(b[tier][key]) / Number(a[tier][key]);
        assert.ok(factor >= 1.5 && factor <= 2.0, `tier ${tier} ${key}: factor ${factor.toFixed(2)}`);
      }
    }
  });

  it('lets one item climb the whole ladder inside its take limit and inside every tier budget', () => {
    for (const host of ['claude', 'codex']) {
      const n = numbers(host);
      // The shortest climb: the gate's minimum of cheap takes (three levels and the narrowing take among them),
      // one map item to classify the failure, then the expensive call with the reserve the gate still demands.
      const cheapTakes = Number(n.A.gate_min_cheap_takes);
      assert.ok(cheapTakes >= 4 && cheapTakes + 1 <= Number(n.A.takes_produce), `${host}: takes`);
      for (const tier of ['A', 'B', 'C', 'D']) {
        const validators = Number(n[tier].validators);
        const atGate = cheapTakes + 1 + Number(n.A.expensive_units) + validators + (1 + validators);
        assert.ok(atGate <= Number(n[tier].budget), `${host} tier ${tier}: ${atGate} units at the gate, budget ${n[tier].budget}`);
      }
    }
  });

  it('keeps the README tables equal to the script and to the preserved evidence rows', () => {
    const readme = readFileSync(join(repoRoot, 'README.md'), 'utf8');
    const evidencePath = 'docs/evidence/frontiercode-2.0-2026-11-16.md';
    const evidence = readFileSync(join(repoRoot, evidencePath), 'utf8');
    assert.ok(readme.includes(`(${evidencePath})`), 'README links the primary evidence file');
    assert.ok(readme.includes('(docs/evidence/independent-sources-2026-11-16.md)'), 'README links the source index');
    const cited = [...readme.matchAll(/^\| (Haiku 5\.5|GPT-6 Luna|Sonnet 5\.5) +\|([^\n]*)\|$/gm)];
    assert.equal(cited.length, 3, 'README cites one row per benchmarked worker model');
    for (const [, model, cells] of cited) {
      const values = cells.match(/\.\d{4}|\$\d+\.\d+/g) ?? [];
      assert.equal(values.length, 6, `${model}: three score and cost pairs`);
      const section = evidence.slice(evidence.indexOf(model));
      for (const value of values) assert.ok(section.includes(value), `${model}: ${value} appears in ${evidencePath}`);
    }
    const a = numbers('claude');
    const b = numbers('codex');
    for (const tier of ['A', 'B', 'C', 'D']) {
      assert.match(readme, new RegExp(`^\\| ${tier} +\\|[^|]+\\| ${a[tier].budget} +\\| ${b[tier].budget} +\\|`, 'm'), `README budget row ${tier}`);
    }
    for (const row of ['`haiku` / `low`    | `gpt-6-luna` / `low`', '`haiku` / `high`   | `gpt-6-luna` / `high`', '`sonnet` / `high`  | `gpt-6.1-terra` / `high`']) {
      assert.ok(readme.includes(row), `README ladder row: ${row}`);
    }
    assert.match(evidence, /\*\*GPT-6\.1 Terra is not in the file\.\*\*/);
  });
});

describe('context size', () => {
  // 40 % of the largest 1.2.0 SKILL.md (33,928 bytes). Raise only with a measured reason.
  const ceiling = Math.floor(33_928 * 0.4);

  it('keeps SKILL.md under the byte and line ceilings on both hosts', () => {
    for (const { host, document } of skills) {
      const bytes = Buffer.byteLength(document);
      assert.ok(bytes <= ceiling, `${host}: SKILL.md is ${bytes} bytes, ceiling ${ceiling}`);
      assert.ok(document.split('\n').length <= 200, `${host}: SKILL.md lines`);
      assert.doesNotMatch(document, /```bash\n#!\/usr\/bin\/env bash/, `${host}: no embedded script`);
      assert.doesNotMatch(document, /\.\d{4} \/ \$|FrontierCode|\b20\d\d-\d\d-\d\d\b/, `${host}: no benchmark numbers or dates in SKILL.md`);
    }
  });

  it('keeps every reference small, linked from SKILL.md and one level deep', () => {
    for (const { host, dir, document } of skills) {
      const references = listFiles(join(dir, 'references')).filter((file) => !file.startsWith('briefs/'));
      for (const file of references) {
        assert.ok(document.includes(`references/${file}`), `${host}: SKILL.md links references/${file}`);
        const text = read(host, `references/${file}`);
        assert.ok(Buffer.byteLength(text) <= 6_000, `${host}: references/${file} size`);
        assert.doesNotMatch(text, /references\/[a-z-]+\.md/, `${host}: references/${file} links no further reference`);
      }
      for (const link of document.match(/references\/[a-z-]+\.md/g) ?? []) assert.ok(existsSync(join(dir, link)), `${host}: ${link} exists`);
      // What a tier B code run loads, and what a tier D run with a gate loads.
      const size = (...files) => files.reduce((sum, file) => sum + Buffer.byteLength(read(host, file)), 0);
      assert.ok(size('SKILL.md') <= ceiling, `${host}: tier B load`);
      assert.ok(size('SKILL.md', 'references/tiers.md', 'references/kind-code.md', 'references/triage.md') <= 22_000, `${host}: tier D load`);
    }
  });

  it('gives workers complete, short templates and keeps the coordinator out of them', () => {
    for (const stage of ['map', 'produce', 'repair', 'escalated', 'verify']) {
      const text = read('claude', `references/briefs/${stage}.md`);
      assert.ok(Buffer.byteLength(text) <= 3_500, `${stage}: template size`);
      assert.match(text, /Do not delegate, start other agents, invoke any orchestration skill, or run any snapshot or ledger script\./, `${stage}: no delegation`);
      assert.match(text, /Never commit, push or deploy/, `${stage}: no commits`);
      assert.match(text, /Never write a credential, token or secret into any file or reply\./, `${stage}: no secrets`);
      assert.match(text, /Reply to the coordinator in at most 10 lines, nothing else:/, `${stage}: reply cap`);
      assert.match(text, /^outcome: /m, `${stage}: reply format`);
    }
    assert.match(read('claude', 'references/briefs/verify.md'), /never record PASS on a vacuous check/);
    assert.match(read('claude', 'references/briefs/kind-infra.md'), /Read-only outside the workspace\./);
    assert.match(read('claude', 'references/briefs/kind-data.md'), /never the data itself/);
    for (const { host, document } of skills) assert.match(document, /`references\/briefs\/`: worker templates\. The script puts them into each brief; do not read them\./, `${host}`);
  });
});
