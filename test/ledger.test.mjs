// Behaviour of scripts/ledger.sh: first attempts, the effort ladder, the model gate, evidence
// acceptance, admission, scope checks, the progress log, status and the final report.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { block, dispatches, startRun } from '../test-support/run-harness.mjs';

const twoItems = `
criterion C1 behavioral | bin/greet prints "hello, world"
criterion C2 behavioral | bin/farewell prints "goodbye, world"
decision Keep the shebang line
item produce greet-text | Make bin/greet print hello, world | owns: bin/greet | criteria: C1
item produce farewell-text | Make bin/farewell print goodbye, world | owns: bin/farewell | criteria: C2
`;
const oneItem = `
criterion C1 behavioral | bin/greet prints "hello, world" | check: bin/greet
item produce greet-text | Make bin/greet print hello, world | owns: bin/greet | criteria: C1
`;
const good = (run, slug, take, criterion, name, text) => {
  run.setScript(name, text);
  run.record(slug, take, [block(criterion, `bin/${name}`, text)]);
};
// A take whose recorded check does not reproduce: the script must find out on its own.
const bad = (run, slug, take, criterion, name, wrong, expected) => {
  run.setScript(name, wrong);
  run.record(slug, take, [block(criterion, `bin/${name}`, expected)]);
};
const lineRe = /^(▶|✓|✗|↑|⇧|⏸|■) (run|batch \d+|started|done|passed|failed|effort|model|retry|blocked|stopped) /;

describe('first attempts and the progress log', () => {
  it('starts every stage of every tier on the cheap model at low effort', (t) => {
    for (const host of ['claude', 'codex']) {
      const cheap = host === 'claude' ? 'haiku' : 'gpt-6-luna';
      for (const tier of ['A', 'B', 'C', 'D']) {
        const run = startRun(t, { host, tier });
        run.plan(`item map scope-greeter | Find where the greeting is produced\n${oneItem}`);
        const first = dispatches(run.dispatch());
        assert.deepEqual(first.map((d) => [d.item, d.model, d.effort]), [['map/scope-greeter', cheap, 'low'], ['produce/greet-text', cheap, 'low']], `${host} ${tier}`);
        run.record('scope-greeter', 1, null);
        run.result('map/scope-greeter', 'DONE');
        good(run, 'greet-text', 1, 'C1', 'greet', 'hello, world');
        run.result('produce/greet-text', 'DONE');
        if (tier === 'A') {
          assert.match(run.log(), /✓ passed {3}verify {16}script check · 1\/1 criteria/);
          continue;
        }
        const validators = dispatches(run.dispatch());
        assert.equal(validators.length, tier === 'D' ? 2 : 1, `${host} ${tier}: validators`);
        for (const v of validators) assert.deepEqual([v.model, v.effort, v.barrier, v.effortName], [cheap, 'low', 'yes', host === 'claude' ? 'effort' : 'reasoning_effort'], `${host} ${tier}: ${v.item}`);
      }
    }
  });

  it('prints the documented log format and a two-line prompt whose first line is shared', (t) => {
    const run = startRun(t);
    assert.match(run.plan(twoItems), /^▶ run {6}tier B · 2 items · budget 24 units · coordinator haiku\/low$/m);
    const out = run.dispatch();
    assert.match(out, /^▶ batch 1 {2}produce · 2 subagents · units 2\/24$/m);
    const [a, b] = dispatches(out);
    assert.equal(a.prompt.split('\n')[0], b.prompt.split('\n')[0]);
    assert.match(a.prompt, /\nStage: Produce \| Item: greet-text \| Take: 1 \| Level: 1 \| Brief: \/.*produce\.greet-text\.take-1\.md$/);
    good(run, 'greet-text', 1, 'C1', 'greet', 'hello, world');
    bad(run, 'farewell-text', 1, 'C2', 'farewell', 'goodbye world', 'goodbye, world');
    assert.match(run.result('produce/greet-text', 'DONE'), /^next: waiting for produce\/farewell-text$/m);
    const closed = run.result('produce/farewell-text', 'DONE');
    assert.match(closed, /^✓ done {5}produce\/greet-text {4}take 1\/8 · level 1\/4 · haiku\/low · \d+:\d\d$/m);
    assert.match(closed, /^✗ failed {3}produce\/farewell-text take 1\/8 · level 1\/4 · haiku\/low · \d+:\d\d · C2: decisive line not in output #\d+$/m);
    assert.match(closed, /^↑ effort {3}produce\/farewell-text level 1→2 · haiku\/low → haiku\/medium · C2: /m);
    assert.match(closed, /^■ batch 1 {2}1\/2 done · \d+:\d\d$/m);
    for (const line of run.log().trim().split('\n')) assert.match(line, lineRe, line);
    for (const line of run.log().split('\n').filter((l) => /^(↑|⇧) /.test(l))) assert.match(line, / · [^·]+$/, 'effort and model lines end with a reason');
    const brief = run.brief('produce/greet-text', 1);
    assert.ok(brief.indexOf('# Produce brief') < brief.indexOf('## Run') && brief.indexOf('## Run') < brief.indexOf('## Your item'), 'shared prefix, then run block, then item');
    assert.match(brief, /^- Keep the shebang line$/m);
    assert.match(brief, /^Owned outputs \(write nowhere else in the workspace\): bin\/greet$/m);
  });

  it('falls back to ASCII symbols outside a UTF-8 locale', (t) => {
    const run = startRun(t, { env: { LC_ALL: 'C' } });
    assert.match(run.plan(oneItem), /^> {2}run {6}tier B - 1 items - budget 24 units/m);
    bad(run, 'greet-text', 1, 'C1', 'greet', 'nope', 'hello, world');
    run.dispatch();
    const out = run.result('produce/greet-text', 'DONE');
    assert.match(out, /^x {2}failed /m);
    assert.match(out, /^\^ {2}effort {3}produce\/greet-text {4}level 1->2 - haiku\/low -> haiku\/medium - /m);
    assert.doesNotMatch(run.log(), /[^\x00-\x7f]/);
  });

  it('restores state from disk: status names every item, its level and the next step', (t) => {
    const run = startRun(t, { tier: 'C' });
    run.plan(twoItems);
    run.dispatch();
    good(run, 'greet-text', 1, 'C1', 'greet', 'hello, world');
    run.result('produce/greet-text', 'DONE');
    const status = run.status();
    assert.match(status, /^host claude · tier C · kind code · coordinator haiku\/low · units 2\/30 · batch 1 \(open\)/m);
    assert.match(status, /^produce\/greet-text {9}returned/m);
    assert.match(status, /^produce\/farewell-text {6}running {5}take 1\/8 · level 1\/4 · haiku\/low$/m);
    assert.match(status, /^next: batch 1 is open; .*Still running: produce\/farewell-text$/m);
    assert.match(status, new RegExp(`^task ${run.task.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'));
  });
});

describe('effort ladder', () => {
  it('moves a failed lowest-level take up without any diagnosis, and never changes the model for an environment failure', (t) => {
    const run = startRun(t);
    run.plan(twoItems);
    run.dispatch();
    run.result('produce/greet-text', 'BLOCKED', '--sig', 'could not find the file');
    const env = run.result('produce/farewell-text', 'BLOCKED', '--class', 'environment', '--sig', 'bash missing');
    assert.match(env, /^↑ effort {3}produce\/greet-text {4}level 1→2 · haiku\/low → haiku\/medium · could not find the file$/m);
    assert.match(env, /^▶ retry {4}produce\/farewell-text same level · environment: bash missing$/m);
    assert.equal(run.field('produce/farewell-text', 'level'), '1');
    for (let take = 2; take <= 3; take++) {
      run.dispatch('produce/farewell-text');
      run.result('produce/farewell-text', 'BLOCKED', '--class', 'throttle', '--sig', 'rate limited');
    }
    assert.equal(run.field('produce/farewell-text', 'level'), '1', 'throttling never raises effort');
    assert.equal(run.field('produce/farewell-text', 'status'), 'blocked');
    assert.match(run.log(), /⏸ blocked {2}produce\/farewell-text environment not fixed after 2 retries: rate limited/);
    assert.doesNotMatch(run.log(), /⇧ model/);
  });

  it('retries an omission once at the same level, continues a first PARTIAL, and steps up on a repeated failure', (t) => {
    const run = startRun(t);
    run.plan(oneItem);
    run.dispatch();
    run.result('produce/greet-text', 'FAIL', '--sig', 'wrong output');
    run.dispatch();
    assert.match(run.result('produce/greet-text', 'FAIL', '--class', 'omission', '--sig', 'forgot the comma'), /▶ retry {4}produce\/greet-text {4}same level · omission: forgot the comma/);
    run.dispatch();
    assert.match(run.result('produce/greet-text', 'FAIL', '--class', 'omission', '--sig', 'forgot the comma'), /↑ effort {3}produce\/greet-text {4}level 2→3 .* same failure twice: forgot the comma/);
    const cont = dispatches(run.dispatch());
    assert.equal(cont[0].effort, 'high');
    assert.match(run.result('produce/greet-text', 'PARTIAL', '--sig', 'half done'), /▶ retry {4}produce\/greet-text {4}same level · continue: half done/);
    assert.equal(dispatches(run.dispatch())[0].continue, 'same-worker');
    assert.match(run.result('produce/greet-text', 'PARTIAL', '--sig', 'half done'), /note: produce\/greet-text failed at the cheap model's top effort/);
    assert.equal(run.field('produce/greet-text', 'status'), 'need-narrow');
  });

  it('blocks on ambiguity until the user answers, then carries the answer into the next brief', (t) => {
    const run = startRun(t);
    run.plan(oneItem);
    run.dispatch();
    assert.match(run.result('produce/greet-text', 'BLOCKED', '--class', 'ambiguity', '--sig', 'keep the legacy greeting?'), /⏸ blocked {2}produce\/greet-text {4}needs your answer: keep the legacy greeting\?/);
    assert.match(run.dispatch(), /note: nothing to dispatch/);
    run.ok('answer', run.task, 'produce/greet-text', 'No, replace it');
    assert.equal(dispatches(run.dispatch())[0].effort, 'low');
    assert.match(run.brief('produce/greet-text', 2), /^- \(greet-text\) No, replace it$/m);
  });

  it('stops early when the same failure repeats at every level and after narrowing', (t) => {
    const run = startRun(t);
    run.plan(oneItem);
    for (let take = 1; take <= 4; take++) {
      if (take === 4) run.dispatch('produce/greet-text', '--narrow', 'only the echo line');
      else run.dispatch();
      bad(run, 'greet-text', take, 'C1', 'greet', 'always wrong', 'hello, world');
      run.result('produce/greet-text', 'DONE');
    }
    assert.match(run.log(), /■ stopped {2}produce\/greet-text {4}take 4\/8 · level 3\/4 · haiku\/high · no progress: same failure at every level and after narrowing/);
    assert.equal(run.used(), 4, 'a stuck item ends long before the budget does');
    assert.doesNotMatch(run.log(), /⇧ model/);
    assert.match(run.report(), /^Unresolved checks\/work:\n {2}produce\/greet-text: no progress/m);
  });

  it('never moves a validator or a map shard to the expensive model', (t) => {
    const run = startRun(t);
    run.plan(`item map scope-greeter | Find the greeting\n${oneItem}`);
    run.dispatch('map/scope-greeter');
    for (let take = 1; take <= 3; take++) {
      if (take > 1) run.dispatch('map/scope-greeter');
      run.result('map/scope-greeter', 'FAIL', '--sig', `no result ${take}`);
    }
    assert.match(run.log(), /■ stopped {2}map\/scope-greeter {5}take 3\/4 · level 3\/3 · haiku\/high · ladder exhausted/);
    assert.ok(run.ledger('gate', run.task, 'map/scope-greeter').status !== 0);
  });
});

describe('model gate', () => {
  const climb = (run, { classify = true } = {}) => {
    run.plan(oneItem);
    for (let take = 1; take <= 3; take++) {
      run.dispatch();
      bad(run, 'greet-text', take, 'C1', 'greet', `wrong ${take}`, 'hello, world');
      run.result('produce/greet-text', 'DONE');
    }
    assert.equal(run.field('produce/greet-text', 'status'), 'need-narrow');
    run.dispatch('produce/greet-text', '--narrow', 'only change the echoed text');
    bad(run, 'greet-text', 4, 'C1', 'greet', 'wrong 4', 'hello, world');
    run.result('produce/greet-text', 'DONE');
    assert.equal(run.field('produce/greet-text', 'status'), 'need-gate');
    if (classify) {
      const diagnosis = join(run.task, 'evidence', 'why.md');
      writeFileSync(diagnosis, 'The worker cannot produce the comma.\nclass: capability\nreproduced: yes\n');
      run.ok('classify', run.task, 'produce/greet-text', 'capability', '--evidence', diagnosis);
    }
  };

  it('opens only with all six conditions, writes escalation.md first, then dispatches the expensive model at high', (t) => {
    for (const [host, expensive, minimum] of [['claude', 'sonnet', 4], ['codex', 'gpt-6.1-terra', 5]]) {
      const run = startRun(t, { host });
      climb(run, { classify: false });
      const record = run.evidence('greet-text', 'escalation.md');
      const refused = run.ok('gate', run.task, 'produce/greet-text');
      assert.match(refused, /^gate [3-5]\/6 for produce\/greet-text: no expensive dispatch/m);
      assert.match(refused, /condition 3 — plan a read-only map item, then classify with its report: item map why-greet-text \| Why does produce\/greet-text fail\?/);
      assert.match(readFileSync(record, 'utf8'), /^3\. FAIL — failure class: unclassified/m);
      assert.doesNotMatch(run.log(), /⇧ model/);
      const diagnosis = join(run.task, 'evidence', 'why.md');
      writeFileSync(diagnosis, 'class: capability\nreproduced: yes\n');
      assert.notEqual(run.ledger('classify', run.task, 'produce/greet-text', 'capability', '--evidence', join(run.task, 'missing.md')).status, 0);
      run.ok('classify', run.task, 'produce/greet-text', 'capability', '--evidence', diagnosis);
      if (minimum === 5) {
        // Codex needs one more corrected cheap take before the gate opens.
        assert.match(run.ok('gate', run.task, 'produce/greet-text'), /condition 1 — dispatch another corrected take/);
        run.dispatch('produce/greet-text', '--correction', 'Print the comma with printf');
        bad(run, 'greet-text', 5, 'C1', 'greet', 'wrong 5', 'hello, world');
        run.result('produce/greet-text', 'DONE');
        run.ok('classify', run.task, 'produce/greet-text', 'capability', '--evidence', diagnosis);
      }
      const opened = run.ok('gate', run.task, 'produce/greet-text');
      assert.match(opened, new RegExp(`^⇧ model {4}produce/greet-text {4}level 3→4 · \\S+/high → ${expensive.replace('.', '\\.')}/high · C1: decisive line not in output #\\d+ · gate 6/6 · escalation\\.md$`, 'm'));
      const text = readFileSync(record, 'utf8');
      for (let n = 1; n <= 6; n++) assert.match(text, new RegExp(`^${n}\\. PASS — `, 'm'), `${host}: condition ${n}`);
      assert.match(text, /\| 3 \| 3 \| \S+\/high \| FAIL\(check\) \|/);
      const before = run.used();
      const [d] = dispatches(run.dispatch());
      assert.deepEqual([d.model, d.effort], [expensive, 'high'], `${host}: expensive take`);
      assert.equal(run.used() - before, host === 'claude' ? 8 : 4, `${host}: expensive call weight`);
      bad(run, 'greet-text', minimum + 1, 'C1', 'greet', 'still wrong', 'hello, world');
      run.result('produce/greet-text', 'DONE');
      assert.match(run.log(), /■ stopped {2}produce\/greet-text .* ladder exhausted/);
    }
  });

  it('refuses a failure that is not a capability failure, and an expensive call the budget cannot carry', (t) => {
    const run = startRun(t);
    climb(run, { classify: false });
    const diagnosis = join(run.task, 'evidence', 'why.md');
    writeFileSync(diagnosis, 'The brief never mentioned the comma.\nclass: omission\n');
    run.ok('classify', run.task, 'produce/greet-text', 'omission', '--evidence', diagnosis);
    assert.match(run.ok('gate', run.task, 'produce/greet-text'), /class "omission" never escalates the model/);
    assert.notEqual(run.ledger('classify', run.task, 'produce/greet-text', 'capability', '--evidence', diagnosis).status, 0, 'the evidence file must say capability itself');
    const tight = startRun(t, { tier: 'A' });
    climb(tight);
    writeFileSync(join(tight.task, 'run/used'), '9\n');
    assert.match(tight.ok('gate', tight.task, 'produce/greet-text'), /condition 6 — the budget does not admit the expensive call/);
    assert.doesNotMatch(tight.log(), /⇧ model/);
  });

  it('cannot be reached before the cheap ladder is climbed', (t) => {
    const run = startRun(t);
    run.plan(oneItem);
    run.dispatch();
    run.result('produce/greet-text', 'FAIL', '--class', 'capability', '--sig', 'too hard');
    assert.notEqual(run.ledger('gate', run.task, 'produce/greet-text').status, 0);
    assert.equal(dispatches(run.dispatch())[0].model, 'haiku');
  });
});

describe('evidence acceptance', () => {
  const produced = (run) => {
    run.plan(oneItem);
    run.dispatch();
    good(run, 'greet-text', 1, 'C1', 'greet', 'hello, world');
    run.result('produce/greet-text', 'DONE');
    run.dispatch();
  };

  it('rejects a validator PASS that is vacuous, unexecuted or weaker than the criterion, and moves that validator up one level', (t) => {
    const cases = [
      [block('C1', 'true', undefined), /C1: no decisive output line quoted/],
      [block('C1', 'true', 'looks fine'), /C1: true printed nothing/],
      [block('C1', 'bin/absent', 'hello, world'), /C1: bin\/absent exit 127/],
      [block('C1', 'bin/greet', 'hello, world', { type: 'inspection', cite: 'bin/greet:2' }), /evidence type inspection does not satisfy a behavioral criterion/],
      ['criterion: C9\nverdict: PASS\ntype: behavioral\ncommand: bin/greet\ndecisive: hello, world', /C1 has no block/],
    ];
    for (const [record, reason] of cases) {
      const run = startRun(t);
      produced(run);
      run.record('checks', 1, [record]);
      const out = run.result('verify/checks', 'PASS');
      assert.match(out, /^✗ failed {3}verify\/checks {9}take 1\/4 · level 1\/3 · haiku\/low · \d+:\d\d · unsupported record: /m);
      assert.match(out, reason);
      assert.match(out, /^↑ effort {3}verify\/checks {9}level 1→2 · haiku\/low → haiku\/medium · unsupported record/m);
      assert.equal(run.field('produce/greet-text', 'status'), 'done', 'the producer is untouched');
      assert.doesNotMatch(run.log(), /✓ passed/);
      const [again] = dispatches(run.dispatch());
      assert.deepEqual([again.item, again.model, again.effort], ['verify/checks', 'haiku', 'medium']);
      run.record('checks', 2, [block('C1', 'bin/greet', 'hello, world')]);
      assert.match(run.result('verify/checks', 'PASS'), /^✓ passed {3}verify {16}1\/1 validators · 1\/1 criteria · units 3\/24$/m);
    }
  });

  it('lets a check or expected text fixed in the plan outrank the check a worker chose', (t) => {
    const run = startRun(t);
    run.write('test/run.sh', '#!/usr/bin/env bash\necho "ok: suite present"\nexit 0\n', 0o755);
    run.plan('criterion C1 behavioral | bin/greet prints hello, world | check: test "$(bin/greet)" = "hello, world" && echo named-ok | expect: named-ok\ncriterion C2 behavioral | bin/farewell prints goodbye | expect: goodbye\nitem produce greet-text | Change the greeting | owns: bin/greet | criteria: C1\nitem produce bye-text | Change the farewell | owns: bin/farewell | criteria: C2');
    run.dispatch();
    // Both workers record the vacuous suite, which passes without exercising anything.
    run.record('greet-text', 1, [block('C1', 'test/run.sh', 'ok: suite present')]);
    run.record('bye-text', 1, [block('C2', 'test/run.sh', 'ok: suite present')]);
    run.result('produce/greet-text', 'DONE');
    const out = run.result('produce/bye-text', 'DONE');
    assert.match(out, /✗ failed {3}produce\/greet-text .* C1: named check test "\$\(bin\/greet\)" = "hello, +exit 1 #\d+/);
    assert.match(out, /✗ failed {3}produce\/bye-text .* C2: output lacks the expected text #\d+/);
    run.dispatch();
    good(run, 'greet-text', 2, 'C1', 'greet', 'hello, world');
    good(run, 'bye-text', 2, 'C2', 'farewell', 'goodbye');
    run.result('produce/greet-text', 'DONE');
    assert.match(run.result('produce/bye-text', 'DONE'), /■ batch 2 {2}2\/2 done/);
    assert.match(run.brief('produce/greet-text', 2), /^- C1 \| behavioral \| bin\/greet prints hello, world \| test "\$\(bin\/greet\)" = "hello, world" && echo named-ok$/m);
  });

  it('treats a return without its record as an ordinary failure, whatever the worker says', (t) => {
    const run = startRun(t);
    run.plan(oneItem);
    run.dispatch();
    assert.match(run.result('produce/greet-text', 'DONE'), /✗ failed {3}produce\/greet-text .* no report file\n↑ effort/);
    run.dispatch();
    run.record('greet-text', 2, null);
    assert.match(run.result('produce/greet-text', 'DONE'), /no check record\n↑ effort {3}produce\/greet-text {4}level 2→3/);
  });

  it('turns a correct validator FAIL into a repair of the owning item and a fresh validation, without escalating the validator', (t) => {
    const run = startRun(t);
    run.plan(twoItems);
    run.dispatch();
    good(run, 'greet-text', 1, 'C1', 'greet', 'hello, world');
    good(run, 'farewell-text', 1, 'C2', 'farewell', 'goodbye world');
    run.result('produce/greet-text', 'DONE');
    run.result('produce/farewell-text', 'DONE');
    run.dispatch();
    run.record('checks', 1, [
      block('C1', 'bin/greet', 'hello, world'),
      block('C2', 'test "$(bin/farewell)" = "goodbye, world"', 'x', { verdict: 'FAIL', exit: 1, decisive: 'n/a', class: 'omission', sig: 'comma missing' }),
    ]);
    const out = run.result('verify/checks', 'FAIL');
    assert.match(out, /^✓ done {5}verify\/checks {9}take 1\/4 · level 1\/3 · haiku\/low · \d+:\d\d · FAIL: C2$/m);
    assert.match(out, /^✗ failed {3}produce\/farewell-text take 1\/8 · level 1\/4 · haiku\/low · verify: C2 comma missing$/m);
    assert.match(out, /^↑ effort {3}produce\/farewell-text level 1→2/m);
    assert.match(out, /^✗ failed {3}verify {16}1\/1 validators · failed: C2 · units 3\/24$/m);
    assert.equal(run.field('verify/checks', 'level'), '1');
    assert.equal(run.field('produce/greet-text', 'status'), 'done');
    const [repair] = dispatches(run.dispatch());
    assert.deepEqual([repair.item, repair.effort], ['produce/farewell-text', 'medium']);
    assert.match(run.brief('produce/farewell-text', 2), /^# Repair brief/);
    assert.match(run.brief('produce/farewell-text', 2), /^Prior records \(read first\): .*take-1\.report\.md /m);
    good(run, 'farewell-text', 2, 'C2', 'farewell', 'goodbye, world');
    run.result('produce/farewell-text', 'DONE');
    const [fresh] = dispatches(run.dispatch());
    assert.deepEqual([fresh.item, fresh.effort], ['verify/checks', 'low'], 'a correct FAIL does not escalate the validator');
    assert.match(fresh.prompt, /Take: 2 \| Level: 1/);
    run.record('checks', 2, [block('C1', 'bin/greet', 'hello, world'), block('C2', 'bin/farewell', 'goodbye, world')]);
    assert.match(run.result('verify/checks', 'PASS'), /✓ passed {3}verify {16}1\/1 validators · 2\/2 criteria · units 5\/24/);
    const report = run.report();
    assert.match(report, /^■ run {6}done · 2\/2 items accepted · 0 unresolved · \d+:\d\d · peak 2 parallel$/m);
    assert.match(report, /^Outcome: 2\/2 items accepted, 0 unresolved; 5 units of 24 used$/m);
    assert.match(report, /^ {2}C2\|PASS\|behavioral\|verify\/checks take 2 on post-\d+$/m);
  });

  it('rejects a validator FAIL the script cannot reproduce', (t) => {
    const run = startRun(t);
    produced(run);
    run.record('checks', 1, [block('C1', 'bin/greet', 'hello, world', { verdict: 'FAIL', exit: 1, class: 'capability', sig: 'wrong text' })]);
    assert.match(run.result('verify/checks', 'FAIL'), /unsupported record: C1: reported FAIL but bin\/greet exits 0/);
    assert.equal(run.field('produce/greet-text', 'status'), 'done');
  });

  it('accepts saved command output, cited sources and inspections only when the quoted line is really there', (t) => {
    const run = startRun(t, { kind: 'infra', plain: true });
    run.plan(`
criterion C1 command-output | The account has two buckets
criterion C2 source | The provider documents versioning as off by default
criterion C3 inspection | The findings table lists both buckets
item produce bucket-report | Write the bucket findings | owns: report/ | criteria: C1,C2,C3
`);
    run.dispatch();
    run.write('report/findings.md', '| bucket | versioning |\n| logs | off |\n| assets | off |\n');
    const saved = run.evidence('bucket-report', 'buckets.json');
    const doc = run.evidence('bucket-report', 'doc.txt');
    const blocks = (command) => [
      `criterion: C1\nverdict: PASS\ntype: command-output\ncommand: ${command}\nsaved: ${saved}\ndecisive: "Name": "assets"`,
      `criterion: C2\nverdict: PASS\ntype: source\ncite: https://docs.example.invalid/versioning\nretrieved: 2026-11-16T10:00Z\nsaved: ${doc}\ndecisive: Versioning is disabled by default`,
      'criterion: C3\nverdict: PASS\ntype: inspection\ncite: report/findings.md:3\ndecisive: | assets | off |',
    ];
    run.record('bucket-report', 1, blocks('aws s3api delete-bucket --bucket assets'));
    writeFileSync(saved, '{"Buckets": [{"Name": "logs"}, {"Name": "assets"}]}\n');
    writeFileSync(doc, 'Versioning is disabled by default for new buckets.\n');
    assert.match(run.result('produce/bucket-report', 'DONE'), /C1: command may change an external system/);
    run.dispatch();
    run.record('bucket-report', 2, blocks('aws s3api list-buckets'));
    assert.match(run.result('produce/bucket-report', 'DONE'), /✓ done {5}produce\/bucket-report/);
    const report = run.report();
    assert.match(report, /possible external changes flagged by the command scan: 1 /);
    assert.match(report, /^Not covered by snapshots: external systems, ignored files$/m);
  });
});

describe('tier D', () => {
  it('runs two validators behind a barrier and adds an independent patch review', (t) => {
    const run = startRun(t, { tier: 'D' });
    assert.match(run.plan(oneItem), /budget 36 units/);
    run.dispatch();
    good(run, 'greet-text', 1, 'C1', 'greet', 'hello, world');
    run.result('produce/greet-text', 'DONE');
    const out = run.dispatch();
    assert.match(out, /^▶ batch 2 {2}verify · 2 subagents · units 3\/36$/m);
    assert.deepEqual(dispatches(out).map((d) => [d.item, d.effort, d.barrier]), [['verify/checks', 'low', 'yes'], ['verify/review', 'low', 'yes']]);
    assert.match(run.brief('verify/review', 1), /^Your criteria: R1$/m);
    assert.match(run.brief('verify/review', 1), /^Integrated patch: .*integrated-post-1\.patch$/m);
    assert.match(readFileSync(join(run.task, 'evidence/integrated-post-1.patch'), 'utf8'), /\+echo "hello, world"/);
    run.record('checks', 1, [block('C1', 'bin/greet', 'hello, world')]);
    const first = run.result('verify/checks', 'PASS');
    assert.match(first, /^next: waiting for verify\/review$/m);
    assert.doesNotMatch(first, /passed|failed/, 'nothing is decided until every validator of the cycle has returned');
    assert.notEqual(run.ledger('dispatch', run.task).status, 0, 'no repair or dispatch while a validator is out');
    run.record('review', 1, ['criterion: R1\nverdict: PASS\ntype: inspection\ncite: bin/greet:2\ndecisive: echo "hello, world"']);
    assert.match(run.result('verify/review', 'PASS'), /✓ passed {3}verify {16}2\/2 validators · 2\/2 criteria · units 3\/36/);
  });
});

describe('admission, width and scope', () => {
  const many = (n, owns = (i) => `bin/${['one', 'two', 'three', 'four', 'five', 'six', 'seven'][i]}`) =>
    Array.from({ length: n }, (_, i) => `criterion C${i + 1} behavioral | script ${i + 1} prints its new text\nitem produce item-${i + 1} | Change script ${i + 1} | owns: ${owns(i)} | criteria: C${i + 1}`).join('\n');

  it('dispatches as wide as eligibility, the writer ceiling and host slots allow', (t) => {
    const run = startRun(t, { tier: 'C' });
    run.plan(many(7));
    const out = run.dispatch();
    assert.equal(dispatches(out).length, 6, 'more than the old cap of four, up to the writer ceiling');
    assert.match(out, /^note: produce\/item-7 waits: writer ceiling 6 per batch$/m);
    const slots = startRun(t, { tier: 'C' });
    slots.plan(many(5));
    const limited = slots.dispatch('--slots', '3');
    assert.equal(dispatches(limited).length, 3);
    assert.match(limited, /^note: produce\/item-4 waits for a free slot \(3 at a time\)$/m);
    const wide = startRun(t, { tier: 'C' });
    wide.plan(`writers 7\n${many(7)}`);
    assert.equal(dispatches(wide.dispatch()).length, 7);
  });

  it('serialises items whose owned outputs overlap and honours declared dependencies', (t) => {
    const run = startRun(t, { tier: 'C' });
    run.plan(`${many(3, (i) => (i === 2 ? 'bin/*' : `bin/${['one', 'two'][i]}`))}\ncriterion C4 behavioral | four\nitem produce item-4 | Change four | owns: lib/four | criteria: C4 | after: item-1`);
    const out = run.dispatch();
    assert.deepEqual(dispatches(out).map((d) => d.item), ['produce/item-1', 'produce/item-2']);
    assert.match(out, /^note: produce\/item-3 waits: its owned outputs overlap produce\/item-1$/m);
  });

  it('keeps the reserve: a batch is admitted only if validation and one repair still fit', (t) => {
    const run = startRun(t, { tier: 'A' });
    run.plan(oneItem);
    writeFileSync(join(run.task, 'run/used'), '13\n');
    const out = run.dispatch();
    assert.equal(dispatches(out).length, 0);
    assert.match(out, /^note: produce\/greet-text is not admitted: budget 14, used 13, this batch 1, still owed 1\./m);
    const retry = startRun(t);
    retry.plan(oneItem);
    retry.dispatch();
    retry.result('produce/greet-text', 'FAIL', '--sig', 'wrong');
    writeFileSync(join(retry.task, 'run/used'), '21\n');
    assert.match(retry.dispatch(), /^■ stopped {2}produce\/greet-text {4}take 1\/8 · level 2\/4 · haiku\/medium · budget does not admit another take$/m);
    assert.match(retry.report(), /^■ run {6}ended with open work · 0\/1 items accepted · 1 unresolved/m);
  });

  it('detects an out-of-scope edit at batch close and lets the coordinator reject or extend', (t) => {
    const run = startRun(t);
    run.plan(twoItems);
    run.dispatch();
    good(run, 'greet-text', 1, 'C1', 'greet', 'hello, world');
    good(run, 'farewell-text', 1, 'C2', 'farewell', 'goodbye, world');
    run.write('README.md', 'stray edit\n');
    run.result('produce/greet-text', 'DONE');
    const out = run.result('produce/farewell-text', 'DONE');
    assert.match(out, /^✗ failed {3}batch 1 {15}out of scope: README\.md$/m);
    assert.notEqual(run.ledger('dispatch', run.task).status, 0);
    const rejected = run.ok('scope', run.task, 'reject');
    assert.match(rejected, /✗ failed {3}produce\/greet-text .* out-of-scope edit: README\.md/);
    run.dispatch();
    assert.match(run.brief('produce/greet-text', 2), /^Cleanup \(revert these only if you changed them; they are outside every ownership\): ,?README\.md$/m);

    const other = startRun(t);
    other.plan(oneItem);
    other.dispatch();
    good(other, 'greet-text', 1, 'C1', 'greet', 'hello, world');
    other.write('lib/helper.sh', 'echo helper\n');
    other.result('produce/greet-text', 'DONE');
    assert.match(other.ok('scope', other.task, 'extend', 'lib/*'), /✓ done {5}produce\/greet-text/);
  });

  it('undoes a dispatch the host refused for capacity and remembers the width', (t) => {
    const run = startRun(t, { tier: 'C' });
    run.plan(many(4));
    run.dispatch();
    assert.match(run.ok('defer', run.task, 'produce/item-3', 'produce/item-4'), /host capacity is 2 parallel workers/);
    assert.equal(run.used(), 2);
    assert.equal(run.field('produce/item-4', 'status'), 'ready');
    for (const n of [1, 2]) {
      good(run, `item-${n}`, 1, `C${n}`, ['one', 'two'][n - 1], `text ${n}`);
      run.result(`produce/item-${n}`, 'DONE');
    }
    assert.deepEqual(dispatches(run.dispatch()).map((d) => d.item), ['produce/item-3', 'produce/item-4']);
  });

  it('rejects malformed plans', (t) => {
    const run = startRun(t);
    assert.match(run.planFails('item produce Bad_Slug | task | owns: a | criteria: C1'), /unknown criterion|slug must be/);
    assert.match(run.planFails('criterion C1 vibes | text'), /unknown evidence type/);
    assert.match(run.planFails('criterion C1 behavioral | t\nitem produce no-owner | task | criteria: C1'), /names its owned outputs/);
    assert.match(run.planFails('item verify mine | task'), /stage must be map or produce/);
    assert.match(run.planFails('item produce a-slug-that-is-far-too-long | t | owns: a | criteria: C1'), /unknown criterion|slug must be/);
  });
});

describe('workspaces outside git and the final report', () => {
  it('snapshots and scope-checks a plain directory', (t) => {
    const run = startRun(t, { plain: true, kind: 'data' });
    assert.match(run.init, /\(plain snapshots, base captured\)/);
    run.plan('criterion C1 reconciliation | totals match the source\nitem produce totals | Sum the sources | owns: out/ | criteria: C1');
    run.dispatch();
    run.write('out/totals.csv', 'region,total\neu,3\n');
    run.write('sources/eu.csv', 'tampered\n');
    run.record('totals', 1, [block('C1', 'grep -c eu out/totals.csv', '1', { type: 'reconciliation' })]);
    assert.match(run.result('produce/totals', 'DONE'), /out of scope: sources\/eu\.csv/);
    assert.equal(existsSync(join(run.workspace, '.git')), false, 'the helper keeps its repository in the task directory');
    assert.match(run.brief('produce/totals', 1), /^## Kind: data aggregation or processing$/m);
  });

  it('flags secrets from the environment by file name only, and promotes tiers upward only', (t) => {
    const run = startRun(t, { env: { FIXTURE_API_TOKEN: 'tok-live-0123456789abcdef' } });
    run.plan(oneItem);
    run.dispatch();
    good(run, 'greet-text', 1, 'C1', 'greet', 'hello, world');
    run.record('greet-text', 1, [block('C1', 'bin/greet', 'hello, world')], 'used token tok-live-0123456789abcdef\n');
    run.result('produce/greet-text', 'DONE');
    assert.match(run.ok('promote', run.task, 'D', 'touches tenant data'), /▶ run {6}tier B→D · budget 36 units · touches tenant data/);
    assert.notEqual(run.ledger('promote', run.task, 'B', 'cheaper').status, 0);
    assert.match(run.status(), /^verify\/review {14}ready/m, 'promotion to D brings the second validator');
    const report = run.report();
    assert.match(report, /^Secrets: FOUND in .*greet-text\/take-1\.report\.md/m);
    assert.doesNotMatch(report, /tok-live/);
    assert.match(report, /^Tier: D \(promoted from B\)$/m);
  });
});

describe('review regressions', () => {
  const toGate = (run) => {
    run.plan(oneItem);
    for (let take = 1; take <= 4; take++) {
      if (take === 4) run.dispatch('produce/greet-text', '--narrow', 'only the echoed text');
      else run.dispatch();
      bad(run, 'greet-text', take, 'C1', 'greet', `wrong ${take}`, 'hello, world');
      run.result('produce/greet-text', 'DONE');
    }
  };
  const diagnose = (run, lines) => {
    const file = join(run.task, 'evidence', 'why.md');
    writeFileSync(file, `${lines.join('\n')}\n`);
    return file;
  };

  it('does not let the failing worker classify its own failure, nor a missing record count as a reproduced failure', (t) => {
    const run = startRun(t);
    run.plan(oneItem);
    for (let take = 1; take <= 4; take++) {
      if (take === 4) run.dispatch('produce/greet-text', '--narrow', 'only the echoed text');
      else run.dispatch();
      // The worker claims a capability failure and leaves no record the script could re-run.
      run.result('produce/greet-text', 'FAIL', '--class', 'capability', '--sig', `too hard ${take}`);
    }
    assert.equal(run.field('produce/greet-text', 'status'), 'need-gate');
    const refused = run.ok('gate', run.task, 'produce/greet-text');
    assert.match(refused, /^gate 4\/6 /m);
    assert.match(refused, /^3\. FAIL — failure class: capability, classified by the failing worker only \(not accepted\)\.$/m);
    assert.match(refused, /^4\. FAIL — independent confirmation: none/m);
    assert.match(refused, /^next: condition 4 — .*item map why-greet-text/m);
    assert.match(refused, /^6\. PASS — budget: used 4 \+ expensive call 8 \+ still owed \(other first takes, validation, reserve\) 3 of 24 units\.$/m);
    // A diagnosis that claims a reproduction the script cannot repeat changes the class but confirms nothing.
    const out = run.ok('classify', run.task, 'produce/greet-text', 'capability', '--evidence', diagnose(run, ['class: capability', 'reproduced: yes', 'command: true']));
    assert.match(out, /the diagnosis says reproduced, but true exits 0 here/);
    assert.match(run.ok('gate', run.task, 'produce/greet-text'), /^gate 5\/6 /m);
    run.ok('classify', run.task, 'produce/greet-text', 'capability', '--evidence', diagnose(run, ['class: capability', 'reproduced: yes', 'command: test "$(bin/greet)" = "hello, world"']));
    assert.match(run.ok('gate', run.task, 'produce/greet-text'), /⇧ model {4}produce\/greet-text/);
  });

  it('fails gate condition 2 when a retry only repeats the previous instruction', (t) => {
    const run = startRun(t);
    run.plan(oneItem);
    run.dispatch();
    run.result('produce/greet-text', 'FAIL', '--sig', 'first');
    for (let take = 2; take <= 3; take++) {
      run.dispatch('produce/greet-text', '--correction', 'Try harder');
      run.result('produce/greet-text', 'FAIL', '--sig', `sig ${take}`);
    }
    run.dispatch('produce/greet-text', '--narrow', 'only the echoed text');
    bad(run, 'greet-text', 4, 'C1', 'greet', 'wrong', 'hello, world');
    run.result('produce/greet-text', 'DONE');
    const out = run.ok('gate', run.task, 'produce/greet-text');
    assert.match(out, /^2\. FAIL — /m);
    assert.match(out, /^next: condition 2 — a retry repeated the previous instruction: ledger\.sh dispatch TASK produce\/greet-text --correction/m);
  });

  it('never dispatches a gated item only to stop it for budget: the gate uses the dispatch formula', (t) => {
    const run = startRun(t);
    toGate(run);
    const file = diagnose(run, ['class: capability', 'reproduced: no']);
    run.ok('classify', run.task, 'produce/greet-text', 'capability', '--evidence', file);
    // 24 - 8 (the call) - 3 (validation and reserve) = 13 is the last value that admits it.
    writeFileSync(join(run.task, 'run/used'), '14\n');
    assert.match(run.ok('gate', run.task, 'produce/greet-text'), /^6\. FAIL — budget: used 14 \+ expensive call 8 \+ still owed .* 3 of 24 units/m);
    writeFileSync(join(run.task, 'run/used'), '13\n');
    assert.match(run.ok('gate', run.task, 'produce/greet-text'), /gate 6\/6/);
    const out = run.dispatch();
    assert.deepEqual(dispatches(out).map((d) => [d.model, d.effort]), [['sonnet', 'high']]);
    assert.equal(run.used(), 21);
  });

  it('gives the expensive model exactly one take, from a fresh brief', (t) => {
    for (const [outcome, args, expected] of [
      ['PARTIAL', ['--sig', 'half done'], /■ stopped {2}produce\/greet-text {4}take 5\/8 · level 4\/4 · sonnet\/high · ladder exhausted: half done/],
      ['FAIL', ['--class', 'omission', '--sig', 'forgot a case'], /■ stopped {2}produce\/greet-text .* ladder exhausted: forgot a case/],
      ['BLOCKED', ['--class', 'environment', '--sig', 'disk full'], /⏸ blocked {2}produce\/greet-text {4}environment on the expensive take, no automatic retry: disk full/],
    ]) {
      const run = startRun(t);
      toGate(run);
      run.ok('classify', run.task, 'produce/greet-text', 'capability', '--evidence', diagnose(run, ['class: capability', 'reproduced: no']));
      run.ok('gate', run.task, 'produce/greet-text');
      run.dispatch();
      const brief = run.brief('produce/greet-text', 5);
      assert.match(brief, /^# Escalated brief \(the one take on the stronger model\)/);
      assert.match(brief, /^Escalation record \(why earlier takes failed\): .*\/evidence\/greet-text\/escalation\.md$/m);
      assert.doesNotMatch(brief, /Narrowed scope/);
      const used = run.used();
      assert.match(run.result('produce/greet-text', outcome, ...args), expected);
      assert.doesNotMatch(run.dispatch(), /^dispatch produce\/greet-text/m);
      assert.equal(run.used(), used, `${outcome}: no second expensive call`);
    }
  });

  it('does not pass tier D while its reviewer is stopped, and says the work is unverified', (t) => {
    const run = startRun(t, { tier: 'D' });
    run.plan(oneItem);
    run.dispatch();
    good(run, 'greet-text', 1, 'C1', 'greet', 'hello, world');
    run.result('produce/greet-text', 'DONE');
    for (let take = 1; take <= 3; take++) {
      run.dispatch();
      run.record('checks', take, [block('C1', 'bin/greet', 'hello, world')]);
      run.result('verify/checks', 'PASS');
      const out = run.result('verify/review', 'UNUSABLE', '--sig', 'no record');
      assert.doesNotMatch(out, /✓ passed/);
    }
    assert.match(run.log(), /■ stopped {2}verify\/review {9}take 3\/4 · level 3\/3 · haiku\/high · ladder exhausted: no record/);
    const next = run.dispatch();
    assert.match(next, /note: verify\/checks is not dispatched: another validator was stopped, so verification cannot complete/);
    assert.match(next, /^next: ledger\.sh report TASK$/m);
    const report = run.report();
    assert.match(report, /^■ run {6}ended with open work · 0\/1 items accepted · 1 unresolved/m);
    assert.match(report, /^ {2}produce\/greet-text: produced, not verified$/m);
    assert.match(report, /^ {2}verify\/review: ladder exhausted: no record$/m);
  });

  it('blocks on a review failure nobody owns instead of validating the same workspace again', (t) => {
    const run = startRun(t, { tier: 'D' });
    run.plan(oneItem);
    run.dispatch();
    good(run, 'greet-text', 1, 'C1', 'greet', 'hello, world');
    run.write('bin/extra', 'echo unrequested\n');
    run.result('produce/greet-text', 'DONE');
    run.ok('scope', run.task, 'extend', 'bin/extra');
    run.dispatch();
    run.record('checks', 1, [block('C1', 'bin/greet', 'hello, world')]);
    run.record('review', 1, ['criterion: R1\nverdict: FAIL\ntype: inspection\ncite: bin/extra:1\ndecisive: echo unrequested\nclass: scope\nsig: unrequested file']);
    run.result('verify/checks', 'PASS');
    const out = run.result('verify/review', 'FAIL');
    assert.match(out, /^⏸ blocked {2}verify {16}no item owns the failed criterion: R1$/m);
    assert.match(out, /^next: validation failed on R1, which no produce item owns\. Plan a fix .*criteria: R1\)/m);
    const before = run.used();
    assert.match(run.dispatch(), /nothing changed since the last validation FAIL/);
    assert.equal(run.used(), before, 'no validator is paid for an unchanged workspace');
    run.plan('item produce drop-extra | Remove bin/extra, which nobody asked for | owns: bin/extra | criteria: R1');
    run.dispatch();
    run.write('bin/extra', '');
    run.sh('rm', ['bin/extra']);
    run.record('drop-extra', 1, ['criterion: R1\nverdict: PASS\ntype: inspection\ncite: bin/greet:2\ndecisive: echo "hello, world"']);
    run.result('produce/drop-extra', 'DONE');
    const again = dispatches(run.dispatch());
    assert.deepEqual(again.map((d) => [d.item, d.effort]), [['verify/checks', 'low'], ['verify/review', 'low']]);
    assert.match(run.brief('verify/checks', 2), /^Correction: Fresh validation of a changed workspace\./m);
  });

  it('enforces take limits at dispatch and rejects a FAIL reply whose record fails nothing', (t) => {
    const run = startRun(t);
    run.plan(oneItem);
    run.dispatch();
    good(run, 'greet-text', 1, 'C1', 'greet', 'hello, world');
    run.result('produce/greet-text', 'DONE');
    run.dispatch();
    run.record('checks', 1, [block('C1', 'bin/greet', 'hello, world')]);
    assert.match(run.result('verify/checks', 'FAIL'), /unsupported record: the reply says FAIL but the record has no FAIL block/);
    writeFileSync(join(run.task, 'items/verify.checks/takes'), '4\n');
    assert.match(run.dispatch(), /■ stopped {2}verify\/checks .* take limit reached/);
  });

  it('accepts tier A only on a check fixed in the plan, applies a plan whole or not at all, and reserves validator slugs', (t) => {
    const run = startRun(t, { tier: 'A' });
    assert.match(run.planFails('request Change the greeting\ncriterion C1 behavioral | bin/greet prints hello, world\nitem produce greet-text | Change it | owns: bin/greet | criteria: C1'), /give criterion C1 a 'check:' command, or use tier B/);
    assert.equal(existsSync(join(run.task, 'criteria/C1')), false, 'a rejected plan leaves nothing behind');
    assert.equal(existsSync(join(run.task, 'request.md')), false);
    run.plan('request Change the greeting\ncriterion C1 behavioral | bin/greet prints hello, world | check: test "$(bin/greet)" = "hello, world" && echo named-ok\nitem produce greet-text | Change it | owns: bin/greet | criteria: C1');
    assert.equal(readFileSync(join(run.task, 'request.md'), 'utf8'), 'Change the greeting\n');
    run.dispatch();
    // The producer's own check says everything is fine; the plan's check decides.
    run.record('greet-text', 1, [block('C1', 'echo reconciled ok', 'reconciled ok')]);
    assert.match(run.result('produce/greet-text', 'DONE'), /✗ failed {3}produce\/greet-text .* C1: named check /);
    const other = startRun(t, { tier: 'D' });
    assert.match(other.planFails(`${oneItem}criterion C2 behavioral | x\nitem produce review | Review it | owns: bin/farewell | criteria: C2`), /slug 'review' is reserved for the validators/);
    assert.equal(existsSync(join(other.task, 'items/produce.greet-text')), false, 'the earlier lines of a rejected plan are rolled back');
  });

  it('flags changing commands by basename and inside quoted SQL, and derives the pinning verdict from what ran', (t) => {
    const run = startRun(t, { kind: 'infra', plain: true });
    run.plan('criterion C1 command-output | buckets listed\ncriterion C2 command-output | rows counted\ncriterion C3 command-output | identity read\nitem produce audit | Audit | owns: report/ | criteria: C1,C2,C3');
    run.dispatch();
    const saved = run.evidence('audit', 'out.txt');
    const record = (a, b, c) => [a, b, c].map((command, i) => `criterion: C${i + 1}\nverdict: PASS\ntype: command-output\ncommand: ${command}\nsaved: ${saved}\ndecisive: data`);
    run.record('audit', 1, record('./tools/bin/aws s3api delete-bucket --bucket x', "psql -c 'delete from orders'", '/usr/local/bin/aws sts get-caller-identity'));
    writeFileSync(saved, 'data\n');
    const out = run.result('produce/audit', 'DONE', '--ran', 'haiku/medium');
    assert.match(out, /C1: command may change an external system; C2: command may c/);
    assert.doesNotMatch(out, /C3/);
    assert.match(out, /\(requested haiku\/low, ran haiku\/medium\)/);
    run.dispatch();
    run.record('audit', 2, record('./tools/bin/aws s3api list-buckets', "psql -c 'select count(*) from orders'", 'aws sts get-caller-identity'));
    run.result('produce/audit', 'DONE', '--ran', 'haiku/medium');
    assert.match(run.report(), /^Pinning: Known mismatch \(1 call\(s\) ran on other settings than requested\); 1 of 2 call\(s\) shown by the host as run on the requested settings, 1 on other settings$/m);

    const verified = startRun(t, { tier: 'A' });
    verified.plan(oneItem);
    verified.dispatch();
    good(verified, 'greet-text', 1, 'C1', 'greet', 'hello, world');
    verified.result('produce/greet-text', 'DONE', '--ran', 'haiku/low');
    assert.match(verified.report(), /^Pinning: Verified; 1 of 1 call\(s\) shown by the host as run on the requested settings, 0 on other settings$/m);

    const hidden = startRun(t, { host: 'codex' });
    assert.match(hidden.init, /pinning: requested, unverified \(nothing to check from here on this host\)/);
    hidden.plan(oneItem);
    assert.match(hidden.ok('pinning', hidden.task, 'mismatch', 'spawn_agent hides model and reasoning_effort'), /⏸ blocked {2}pinning {15}known mismatch \(spawn_agent hides model and reasoning_effort\); continuing as best effort/);
    const block1 = hidden.dispatch();
    assert.match(block1, /^dispatch produce\/greet-text \| model=gpt-6-luna \| reasoning_effort=low \| barrier=no \| continue=no$/m);
    assert.doesNotMatch(block1, /\beffort=low \| background|prompt|one message/);
    good(hidden, 'greet-text', 1, 'C1', 'greet', 'hello, world');
    hidden.result('produce/greet-text', 'DONE');
    hidden.ok('stop', hidden.task, 'verify/checks', 'not needed for this test');
    assert.match(hidden.report(), /^Pinning: Known mismatch \(spawn_agent hides model and reasoning_effort\)/m);
  });

  it('treats a fallback-only subagent model as no mismatch and names a forced one', (t) => {
    assert.match(startRun(t, { env: { CLAUDE_CODE_SUBAGENT_MODEL: 'haiku' } }).init, /pinning: requested, unverified/);
    const forced = startRun(t, { env: { CLAUDE_CODE_SUBAGENT_MODEL: 'opus', CLAUDE_CODE_SUBAGENT_MODEL_FORCE: '1' } });
    assert.match(forced.init, /pinning: KNOWN MISMATCH — CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1 \(forced model: opus\)/);
    assert.match(forced.plan(oneItem), /pinning: known mismatch \(CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1 \(forced model: opus\)\)$/m);
    assert.match(startRun(t, { env: { CLAUDE_CODE_EFFORT_LEVEL: 'low' } }).init, /KNOWN MISMATCH — CLAUDE_CODE_EFFORT_LEVEL=low/);
  });
});
