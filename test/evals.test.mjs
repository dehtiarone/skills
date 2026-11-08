// Static checks of the plugin-eval suite under claude/evals: the cases load, every grader pattern
// compiles and matches representative JSON-encoded tool inputs, and every fixture seeds the scenario
// its graders require. Scored runs need `claude plugin eval` and credentials; see the suite README.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { parseFrontmatter, parseYamlSubset, repoRoot } from '../test-support/skill-pair.mjs';

const suite = join(repoRoot, 'claude/evals/cheap-parallel-agents');
const plugin = JSON.parse(readFileSync(join(repoRoot, 'claude/.claude-plugin/plugin.json'), 'utf8'));
const invocation = `/${plugin.name}:cheap-parallel-agents `;
const pinning = new Set(['unavailable-pinning-effort-env', 'known-mismatch-haiku-alias']);
const graderTypes = new Set(['regex', 'tool_used', 'tool_order', 'file_exists', 'llm', 'baseline']);

const cases = readdirSync(suite, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => {
    const dir = join(suite, entry.name);
    const graders = Object.fromEntries(
      readdirSync(join(dir, 'graders'))
        .sort()
        .map((file) => {
          const text = readFileSync(join(dir, 'graders', file), 'utf8');
          return [file, { text, ...parseFrontmatter(text) }];
        }),
    );
    return {
      name: entry.name,
      dir,
      prompt: parseFrontmatter(readFileSync(join(dir, 'prompt.md'), 'utf8')),
      caseYaml: parseYamlSubset(readFileSync(join(dir, 'case.yaml'), 'utf8')),
      fixture: readFileSync(join(dir, 'fixture.sh'), 'utf8'),
      graders,
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

const compile = (pattern, where) => {
  assert.equal(typeof pattern, 'string', `${where}: pattern is a string`);
  try {
    return new RegExp(pattern);
  } catch (error) {
    assert.fail(`${where}: ${error.message}`);
  }
};
const matcher = (grader, where) => {
  const spec = grader.frontmatter;
  if (spec.type === 'tool_used') return compile(spec.input_match, where);
  if (spec.type === 'tool_order') return compile(spec.before.input_match, where);
  return compile(spec.pattern, where);
};
const encode = (input) => JSON.stringify(input);

describe('eval suite layout', () => {
  it('has eleven complete cases named after their directories', () => {
    assert.equal(cases.length, 11);
    for (const { name, prompt, caseYaml, dir } of cases) {
      assert.equal(prompt.frontmatter.name, name, `${name}: prompt name`);
      assert.deepEqual(caseYaml, { schema_version: '1.1', name, context: { scaffold_script: 'fixture.sh' } }, `${name}: case.yaml`);
      assert.ok(existsSync(join(dir, 'fixture.sh')), `${name}: fixture.sh`);
    }
  });

  it('invokes the explicit-only skill by its plugin-namespaced slash command and tags cases for --tag', () => {
    for (const { name, prompt } of cases) {
      const fm = prompt.frontmatter;
      assert.ok(prompt.body.startsWith(invocation), `${name}: prompt starts with ${invocation.trim()}`);
      assert.deepEqual(fm.tags, pinning.has(name) ? ['cheap-parallel-agents-pinning'] : ['cheap-parallel-agents'], `${name}: tags`);
      assert.deepEqual(fm.plugins, ['../../..'], `${name}: plugins`);
      assert.ok(fm.allowed_tools.includes('Agent') && !fm.allowed_tools.includes('Skill'), `${name}: tools`);
      assert.equal(fm.env, undefined, `${name}: env (only EVAL_* keys are allowed, and none are needed)`);
      assert.ok(fm.max_turns <= 200 && fm.timeout_seconds <= 3600 && fm.runs >= 1, `${name}: limits`);
    }
  });

  it('parses every grader, compiles every pattern, and keeps llm judges off the truncated trace', () => {
    for (const { name, graders } of cases) {
      assert.ok(Object.keys(graders).length >= 12, `${name}: grader count`);
      for (const [file, grader] of Object.entries(graders)) {
        const where = `${name}/${file}`;
        const spec = grader.frontmatter;
        assert.ok(graderTypes.has(spec.type), `${where}: type`);
        if (spec.type === 'regex') {
          compile(spec.pattern, where);
          assert.ok(['last_message', 'trace'].includes(spec.target) || spec.target?.source === 'file', `${where}: target`);
          assert.ok(spec.match === undefined || ['contains', 'not_contains'].includes(spec.match) || /^count:\d+$/.test(spec.match), `${where}: match`);
        } else if (spec.type === 'tool_used') {
          assert.equal(typeof spec.tool, 'string', `${where}: tool`);
          if (spec.input_match !== undefined) compile(spec.input_match, where);
          assert.ok(spec.min !== undefined || spec.max !== undefined, `${where}: min or max`);
        } else if (spec.type === 'tool_order') {
          for (const side of ['before', 'after']) {
            assert.equal(typeof spec[side].tool, 'string', `${where}: ${side}.tool`);
            compile(spec[side].input_match, `${where}: ${side}`);
          }
        } else if (spec.type === 'llm') {
          assert.equal(spec.focus, 'last_message', `${where}: an llm judge sees only 24 trace messages, so judges read the final report`);
          assert.ok(grader.body.trim().length > 40, `${where}: criteria`);
        }
      }
    }
  });

  it('keeps same-named graders byte-identical across cases', () => {
    const seen = new Map();
    for (const { name, graders } of cases) {
      for (const [file, { text }] of Object.entries(graders)) {
        const first = seen.get(file);
        if (first) assert.equal(text, first.text, `${name}/${file} differs from ${first.name}/${file}`);
        else seen.set(file, { name, text });
      }
    }
  });
});

describe('grader patterns against representative tool inputs', () => {
  const plain = '/tmp/cheap-parallel-agents/task.aB3dE9';
  const spaced = '/Users/v d/Library/tmp/cheap-parallel-agents/task.x';
  // Four spellings of one helper command, as the coordinator may quote them.
  const spellings = (args) => [
    `bash ${plain}/agent-snapshot.sh ${args('', plain)}`,
    `bash "${plain}/agent-snapshot.sh" ${args('"', plain)}`,
    `bash '${plain}/agent-snapshot.sh' ${args("'", plain)}`,
    `bash "${spaced}/agent-snapshot.sh" ${args('"', spaced)}`,
  ];
  const capture = (name) => (q, root) => `capture ${q}${root}/state${q} ${name}`;
  const diff = (rest) => (q, root) => `diff ${q}${root}/state${q} ${rest}`;
  const table = {
    'captures-post-before-validator.md': {
      yes: [...spellings(capture('post-1')), ...spellings(capture('post-2')), `bash "${plain}/agent-snapshot.sh" capture "${plain}/state" pre-1 && bash "${plain}/agent-snapshot.sh" capture "${plain}/state" post-1`],
      no: spellings(capture('pre-1')),
    },
    'pre-before-implement.md': { yes: spellings(capture('pre-1')), no: [...spellings(capture('pre-10')), ...spellings(capture('post-1'))] },
    'final-capture-before-acceptance.md': { yes: spellings(capture('final')), no: spellings(capture('post-1')) },
    'final-diff-checked.md': {
      yes: [...spellings(diff('post-1 final names0')), `bash "${plain}/agent-snapshot.sh" diff "${plain}/state" post-2 final names0 | tr '\\0' '\\n'`],
      no: spellings(diff('pre-1 post-1 names0')),
    },
    'patch-written.md': {
      yes: [...spellings(diff('base post-1 patch')), `bash "${plain}/agent-snapshot.sh" diff "${plain}/state" base post-2 patch > "${plain}/evidence/integrated.patch"`],
      no: spellings(diff('pre-1 post-1 stat')),
    },
  };

  it('snapshot graders accept unquoted, double-quoted, single-quoted and spaced helper paths', () => {
    let checked = 0;
    for (const { name, graders } of cases) {
      for (const [file, grader] of Object.entries(graders)) {
        const usesHelper = ['tool_used', 'tool_order'].includes(grader.frontmatter.type) && grader.text.includes('agent-snapshot');
        assert.ok(!usesHelper || table[file], `${name}/${file}: snapshot grader without samples`);
      }
      for (const [file, samples] of Object.entries(table)) {
        if (!graders[file]) continue;
        const regex = matcher(graders[file], `${name}/${file}`);
        for (const command of samples.yes) assert.ok(regex.test(encode({ command, description: 'snapshot' })), `${name}/${file} should match ${command}`);
        for (const command of samples.no) assert.ok(!regex.test(encode({ command, description: 'snapshot' })), `${name}/${file} should not match ${command}`);
        checked++;
      }
    }
    assert.equal(checked, cases.length + 4, `checked ${checked} snapshot graders`);
  });

  it('stage-header graders tell validators, implementers, repairs and backgrounded validators apart', () => {
    const header = (stage, item, attempt, extra = '') => `Stage: ${stage} | Item: ${item} | Attempt: ${attempt} | Rung: 1\n${extra}`;
    const implement = encode({ prompt: header('Implement', 'greet', 1, 'Ownership: bin/greet. Snapshot pre-1 (tree abc). Do not validate your own work.'), model: 'haiku', effort: 'medium', subagent_type: 'general-purpose' });
    const repair = encode({ prompt: header('Implement', 'greet', 2, 'Correction: see /tmp/x/evidence/greet/attempt-1.report.md and attempt-1.accept.md. Replace these hunks.'), model: 'haiku', effort: 'medium' });
    const validator = encode({ prompt: header('Validate', 'validate', 1, 'Frozen snapshot post-1 (tree def).'), model: 'haiku', effort: 'medium' });
    const backgrounded = encode({ run_in_background: true, prompt: header('Validate', 'validate-tests', 1), model: 'haiku', effort: 'medium' });
    const sample = cases.find((c) => c.name === 'tier-d-early-fail-barrier');
    const re = (c, file) => matcher(c.graders[file], `${c.name}/${file}`);

    assert.ok(re(sample, 'validator-dispatched.md').test(validator) && !re(sample, 'validator-dispatched.md').test(implement));
    assert.ok(re(sample, 'briefs-carry-stage-header.md').test(implement) && re(sample, 'briefs-carry-stage-header.md').test(validator));
    assert.ok(re(sample, 'repair-dispatched.md').test(repair) && !re(sample, 'repair-dispatched.md').test(implement) && !re(sample, 'repair-dispatched.md').test(validator));
    assert.ok(re(sample, 'repair-cites-attempt-1.md').test(repair) && !re(sample, 'repair-cites-attempt-1.md').test(implement));
    assert.ok(re(sample, 'validators-not-backgrounded.md').test(backgrounded) && !re(sample, 'validators-not-backgrounded.md').test(validator) && !re(sample, 'validators-not-backgrounded.md').test(encode({ run_in_background: true, prompt: header('Implement', 'greet', 1) })));
    assert.ok(re(sample, 'captures-post-before-validator.md').test(encode({ command: `bash ${plain}/agent-snapshot.sh capture ${plain}/state post-1` })));
    assert.ok(new RegExp(sample.graders['captures-post-before-validator.md'].frontmatter.after.input_match).test(validator));
  });

  it('progress-line and final-report graders match the skill templates, escaped or not', () => {
    const { graders } = cases[0];
    const progress = matcher(graders['progress-line-format.md'], 'progress');
    const line = '[tier B] Implement/item-2 · rung 1 (haiku/medium → unavailable) · call 3/7 · 04:10 → accepted (2 files, attempt-1.accept.md); next: capture post-1, Validate';
    assert.ok(progress.test(JSON.stringify({ text: line })), 'raw unicode');
    assert.ok(progress.test(JSON.stringify({ text: line }).replaceAll('·', '\\u00b7').replaceAll('→', '\\u2192')), 'escaped unicode');
    assert.ok(progress.test(JSON.stringify({ text: line.replace('haiku/medium', 'haiku/max') })), 'max is the top rung');
    for (const skipped of ['high', 'xhigh']) {
      assert.ok(!progress.test(JSON.stringify({ text: line.replace('haiku/medium', `haiku/${skipped}`) })), `${skipped} is not on the ladder`);
    }
    const skips = matcher(graders['skips-high-and-xhigh.md'], 'skips');
    assert.ok(skips.test(JSON.stringify({ prompt: 'x', model: 'haiku', effort: 'xhigh' })) && skips.test(JSON.stringify({ model: 'haiku', effort: 'high' })));
    assert.ok(!skips.test(JSON.stringify({ model: 'haiku', effort: 'max' })) && !skips.test(JSON.stringify({ model: 'haiku', effort: 'medium' })));
    const report = matcher(graders['final-report-fields.md'], 'report');
    const template = ['Tier: B', 'Coordinator: sonnet/high', 'Ledger: …', 'Pinning: Verified 3', 'Parallelism: 1 batch', 'Effort distribution: 0/3/0', 'Verified: C1', 'Choices: none', 'Unresolved checks/work: none', 'Working tree: clean', 'External actions: none', 'Usage: estimate', 'Post-acceptance defects: not assessed'].join('\n');
    assert.ok(report.test(template));
    assert.ok(!report.test(template.replace('Parallelism: 1 batch\n', '')), 'Parallelism is required');
  });
});

// Trace graders. The eval runner joins one JSON.stringify'd stream event per line. Claude Code emits one
// content block per assistant event: parallel tool calls share message.id across lines, with tool results in
// between, and subagent events carry a non-null parent_tool_use_id. These builders mirror that shape.
describe('trace graders against stream-shaped traces', () => {
  let seq = 0;
  const toolUse = (name, input) => ({ type: 'tool_use', id: `toolu_${String(seq++).padStart(4, '0')}`, name, input });
  const text = (value) => ({ type: 'text', text: value });
  const event = (id, block, parent = null, keysFirst = false) => {
    const body = { type: 'assistant', message: { id, type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [block], stop_reason: null } };
    return JSON.stringify(keysFirst ? { parent_tool_use_id: parent, ...body, session_id: 's' } : { ...body, parent_tool_use_id: parent, session_id: 's', uuid: `u${seq++}` });
  };
  const result = (toolUseId, value, parent = null) =>
    JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUseId, content: value }] }, parent_tool_use_id: parent, session_id: 's' });
  const trace = (...lines) => [JSON.stringify({ type: 'system', subtype: 'init', session_id: 's' }), ...lines].join('\n');
  const brief = (stage, item, attempt, extra = '') => `Stage: ${stage} | Item: ${item} | Attempt: ${attempt} | Rung: 1\nOwnership: ${extra}`;
  const agent = (stage, item, attempt, extra = '') => toolUse('Agent', { description: `${stage} ${item}`, prompt: brief(stage, item, attempt, extra), model: 'haiku', effort: 'medium', subagent_type: 'general-purpose' });
  const bash = (command) => toolUse('Bash', { command, description: 'snapshot' });
  const read = (path) => toolUse('Read', { file_path: path });
  const task = '/tmp/cheap-parallel-agents/task.aB3dE9';
  const grader = (caseName, file) => {
    const found = cases.find((c) => c.name === caseName);
    assert.ok(found?.graders[file], `${caseName}/${file} exists`);
    return { spec: found.graders[file].frontmatter, regex: matcher(found.graders[file], `${caseName}/${file}`) };
  };
  // A grader "passes" a trace the way the runner scores it: contains, or not_contains.
  const passes = ({ spec, regex }, value) => (spec.match === 'not_contains' ? !regex.test(value) : regex.test(value));

  it('coordinator reads count only on the main thread, and a redirect alone is not a read', () => {
    const inspects = grader('tier-b-parallel-two-items', 'inspects-acceptance-record.md');
    const patch = grader('tier-d-early-fail-barrier', 'coordinator-read-patch.md');
    const attempt2 = grader('repair-then-fresh-validation', 'reads-attempt-2-record.md');
    const record = `${task}/evidence/greet/attempt-1.accept.md`;
    const patchFile = `${task}/evidence/integrated-post-2.patch`;
    assert.ok(passes(inspects, trace(event('msg_a1', read(record)))), 'main-thread Read of a record');
    assert.ok(passes(inspects, trace(event('msg_a1', read(record), null, true))), 'key order does not matter');
    assert.ok(!passes(inspects, trace(event('msg_s1', read(record), 'toolu_0001'))), 'a validator reading the record does not count');
    assert.ok(!passes(inspects, trace(event('msg_a1', read(`${task}/evidence/greet/attempt-1.report.md`)))), 'the report is not the acceptance record');
    assert.ok(passes(attempt2, trace(event('msg_a2', read(`${task}/evidence/greet/attempt-2.accept.md`)))));
    assert.ok(!passes(attempt2, trace(event('msg_a2', read(record)))));
    const redirect = bash(`bash "${task}/agent-snapshot.sh" diff "${task}/state" base post-2 patch > "${patchFile}"`);
    assert.ok(!passes(patch, trace(event('msg_p1', redirect), result(redirect.id, ''))), 'write-only redirect is not a read');
    assert.ok(!passes(patch, trace(event('msg_p1', redirect), event('msg_s2', read(patchFile), 'toolu_0002'))), 'a validator reading the patch does not count');
    assert.ok(passes(patch, trace(event('msg_p1', redirect), result(redirect.id, ''), event('msg_p2', read(patchFile)))), 'coordinator reads the written patch');
  });

  it('parallel dispatch means two implement calls in one assistant message, across lines', () => {
    const parallel = grader('tier-b-parallel-two-items', 'parallel-dispatch.md');
    const first = agent('Implement', 'greet', 1, 'bin/greet');
    const second = agent('Implement', 'farewell', 1, 'bin/farewell test/run.sh');
    assert.ok(passes(parallel, trace(event('msg_b1', text('Dispatching batch 1.')), event('msg_b1', first), result(first.id, 'running'), event('msg_b1', second))), 'same id, tool result in between');
    assert.ok(!passes(parallel, trace(event('msg_b1', first), result(first.id, 'done'), event('msg_b2', second))), 'serial dispatch');
    assert.ok(!passes(parallel, trace(event('msg_b1', text('Stage: Implement | Item: greet | Attempt: 1')), event('msg_b1', second))), 'a text block is not a dispatch');
    assert.ok(!passes(parallel, trace(event('msg_s1', first, 'toolu_0003'), event('msg_s1', second, 'toolu_0003'))), 'subagent lines do not count');
  });

  it('batch-size and ownership graders see whole assistant messages', () => {
    const five = grader('reserve-arithmetic-width-shrinks', 'no-batch-of-five.md');
    const owners = grader('overlapping-ownership-serialises', 'no-concurrent-greet-owners.md');
    const calls = (n, id) => Array.from({ length: n }, (_, i) => event(id, agent('Implement', `item-${i + 1}`, 1, `bin/${i + 1}`)));
    assert.ok(!passes(five, trace(...calls(5, 'msg_w1'))), 'five implementers in one message fail the case');
    assert.ok(passes(five, trace(...calls(4, 'msg_w1'), ...calls(1, 'msg_w2'))), 'four, then one, is allowed');
    const greetA = agent('Implement', 'greet-arg', 1, 'bin/greet');
    const greetB = agent('Implement', 'greet-sep', 1, 'bin/greet');
    const farewell = agent('Implement', 'tests', 1, 'test/run.sh');
    assert.ok(!passes(owners, trace(event('msg_o1', greetA), result(greetA.id, 'running'), event('msg_o1', greetB))), 'two concurrent bin/greet owners fail');
    assert.ok(passes(owners, trace(event('msg_o1', greetA), event('msg_o1', farewell), event('msg_o2', greetB))), 'serialised owners pass');
  });

  it('revalidation must follow the repair and a fresh post capture', () => {
    const revalidated = grader('repair-then-fresh-validation', 'revalidated-after-repair.md');
    const repair = event('msg_r1', agent('Implement', 'greet', 2, `bin/greet; see ${task}/evidence/greet/attempt-1.accept.md`));
    const capture = event('msg_r2', bash(`bash "${task}/agent-snapshot.sh" capture "${task}/state" post-2`));
    const validate2 = event('msg_r3', agent('Validate', 'validate', 2, 'none; frozen snapshot post-2'));
    const validateRetry = event('msg_r0', agent('Validate', 'validate', 2, 'none; frozen snapshot post-1'));
    assert.ok(passes(revalidated, trace(repair, capture, validate2)));
    assert.ok(!passes(revalidated, trace(repair, validate2, capture)), 'validator before the capture');
    assert.ok(!passes(revalidated, trace(validateRetry, repair, capture)), 'a validator retry before the repair is not revalidation');
    assert.ok(!passes(revalidated, trace(repair, capture, event('msg_r3', agent('Validate', 'validate', 2), 'toolu_0004'))), 'subagent lines do not count');
  });

  it('cross-line graders stay fast on a large trace', () => {
    const filler = Array.from({ length: 4000 }, (_, i) => result(`toolu_f${i}`, 'x'.repeat(200)));
    const big = trace(...Array.from({ length: 4 }, (_, i) => event('msg_big', agent('Implement', `i${i}`, 1, 'f'))), ...filler);
    const started = Date.now();
    for (const [c, f] of [['reserve-arithmetic-width-shrinks', 'no-batch-of-five.md'], ['tier-b-parallel-two-items', 'parallel-dispatch.md'], ['repair-then-fresh-validation', 'revalidated-after-repair.md']]) {
      grader(c, f).regex.test(big);
    }
    assert.ok(Date.now() - started < 2000, `took ${Date.now() - started} ms`);
  });
});

describe('fixtures', () => {
  const run = (cwd, command, args, env = {}) =>
    spawnSync(command, args, { cwd, encoding: 'utf8', env: { ...process.env, ...env, CHECK_DELAY: '0' }, timeout: 30_000 });
  const scaffold = (t, c) => {
    const dir = mkdtempSync(join(tmpdir(), `eval-fixture-${c.name}-`));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const result = run(dir, 'bash', [join(c.dir, 'fixture.sh')]);
    assert.equal(result.status, 0, `${c.name}: fixture failed: ${result.stderr}`);
    return dir;
  };
  const greet = (dir, text) => writeFileSync(join(dir, 'bin/greet'), `#!/usr/bin/env bash\necho "${text}"\n`);

  it('every fixture is valid Bash and scaffolds a committed repository', (t) => {
    for (const c of cases) {
      assert.equal(run(repoRoot, 'bash', ['-n', join(c.dir, 'fixture.sh')]).status, 0, `${c.name}: bash -n`);
      const dir = scaffold(t, c);
      assert.equal(run(dir, 'git', ['status', '--porcelain']).stdout, '', `${c.name}: clean after scaffold`);
    }
  });

  it('hidden acceptance tests reject the natural first attempt and accept the hidden string', (t) => {
    for (const [name, expected] of [['repair-then-fresh-validation', 'Hello, World! (greeter v2)'], ['retry-preserves-attempt-1-evidence', 'Greetings, planet Earth!']]) {
      const c = cases.find((entry) => entry.name === name);
      const dir = scaffold(t, c);
      assert.notEqual(run(dir, 'bash', ['test/run.sh']).status, 0, `${name}: scaffold state fails`);
      greet(dir, 'hello, world');
      assert.notEqual(run(dir, 'bash', ['test/run.sh']).status, 0, `${name}: natural guess fails`);
      greet(dir, expected);
      assert.equal(run(dir, 'bash', ['test/run.sh']).status, 0, `${name}: hidden string passes`);
      assert.ok(!c.prompt.body.includes(expected), `${name}: prompt does not leak the hidden string`);
    }
  });

  it('the tier D fixture fails fast on the hidden index while the slow check passes on the column alone', (t) => {
    const c = cases.find((entry) => entry.name === 'tier-d-early-fail-barrier');
    const dir = scaffold(t, c);
    const schema = join(dir, 'db/schema.sql');
    writeFileSync(schema, 'CREATE TABLE users (id INTEGER PRIMARY KEY, tenant_id INTEGER NOT NULL, email TEXT NOT NULL);\n');
    assert.equal(run(dir, 'bash', ['db/checks/check_schema.sh']).status, 0, 'slow check passes with the column');
    assert.notEqual(run(dir, 'bash', ['db/checks/check_index.sh']).status, 0, 'fast check fails without the index');
    writeFileSync(schema, `${readFileSync(schema, 'utf8')}CREATE INDEX idx_users_tenant_email ON users (tenant_id, email);\n`);
    assert.equal(run(dir, 'bash', ['db/checks/check_index.sh']).status, 0, 'fast check passes with the index');
    assert.ok(!c.prompt.body.includes('idx_users_tenant_email'), 'prompt does not leak the index name');
  });

  it('the vacuous and blocked suites behave as their cases claim', (t) => {
    const vacuous = scaffold(t, cases.find((entry) => entry.name === 'unsupported-pass-rejected'));
    assert.equal(run(vacuous, 'bash', ['test/run.sh']).status, 0, 'vacuous suite passes without running anything');
    const blocked = scaffold(t, cases.find((entry) => entry.name === 'budget-exhaustion-reports'));
    const result = run(blocked, 'bash', ['test/run.sh']);
    assert.equal(result.status, 2, 'blocked suite exits 2');
    assert.match(result.stdout, /frobnicate-9000/);
    const five = scaffold(t, cases.find((entry) => entry.name === 'reserve-arithmetic-width-shrinks'));
    for (const n of ['one', 'two', 'three', 'four', 'five']) assert.equal(run(five, 'bash', [`bin/${n}`]).stdout.trim(), n);
  });
});
