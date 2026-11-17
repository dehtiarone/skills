// Behaviour of scripts/ledger.sh: first attempts, the effort ladder, the model gate, evidence
// acceptance, admission, scope checks, the progress log, status and the final report.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
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
criterion C1 behavioral | bin/greet prints "hello, world" | check: bin/greet | expect: hello, world
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
    assert.match(status, /^next: batch 1 is open; .*Still running: produce\/farewell-text\. If you no longer hold these workers \(after a compaction\): ledger\.sh reconcile TASK lists each one with its recorded worker id$/m);
    assert.match(status, /^acceptance: incomplete \(a batch is open\)$/m);
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

  it('raises effort on an omission like on any other failure, and continues a first PARTIAL at the same level', (t) => {
    const run = startRun(t);
    run.plan(oneItem);
    run.dispatch();
    run.result('produce/greet-text', 'FAIL', '--sig', 'wrong output');
    run.dispatch();
    const omitted = run.result('produce/greet-text', 'FAIL', '--class', 'omission', '--sig', 'forgot the comma');
    assert.match(omitted, /↑ effort {3}produce\/greet-text {4}level 2→3 · haiku\/medium → haiku\/high · forgot the comma/);
    assert.doesNotMatch(omitted, /same level/, 'a concrete failure never earns a retry at the same effort');
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
    if (classify) assert.equal(run.diagnose('produce/greet-text', ['class: capability', 'reproduced: yes', 'The worker cannot produce the comma.']).status, 0);
  };

  it('opens only with all six conditions, writes escalation.md first, then dispatches the expensive model at high', (t) => {
    for (const [host, expensive, minimum] of [['claude', 'sonnet', 4], ['codex', 'gpt-6.1-terra', 5]]) {
      const run = startRun(t, { host });
      climb(run, { classify: false });
      const record = run.evidence('greet-text', 'escalation.md');
      const refused = run.ok('gate', run.task, 'produce/greet-text');
      assert.match(refused, /^gate [3-5]\/6 for produce\/greet-text: no expensive dispatch/m);
      assert.match(refused, /condition 3 — plan a read-only map item and dispatch it: item map why-greet-text \| Why does produce\/greet-text fail\?.* Then: ledger\.sh classify TASK produce\/greet-text <class> --by map\/why-greet-text$/m);
      assert.match(readFileSync(record, 'utf8'), /^3\. FAIL — failure class: unclassified/m);
      assert.doesNotMatch(run.log(), /⇧ model/);
      assert.notEqual(run.ledger('classify', run.task, 'produce/greet-text', 'capability', '--evidence', join(run.task, 'missing.md')).status, 0);
      assert.equal(run.diagnose('produce/greet-text', ['class: capability', 'reproduced: yes'], 'why-greet-text').status, 0);
      if (minimum === 5) {
        // Codex needs one more corrected cheap take before the gate opens.
        assert.match(run.ok('gate', run.task, 'produce/greet-text'), /condition 1 — dispatch another corrected take/);
        run.dispatch('produce/greet-text', '--correction', 'Print the comma with printf');
        bad(run, 'greet-text', 5, 'C1', 'greet', 'wrong 5', 'hello, world');
        run.result('produce/greet-text', 'DONE');
        // The earlier diagnosis is about an older take: a fresh one is needed.
        assert.match(run.ledger('classify', run.task, 'produce/greet-text', 'capability', '--by', 'map/why-greet-text').stderr, /ran before the latest take/);
        assert.equal(run.diagnose('produce/greet-text', ['class: capability', 'reproduced: yes'], 'why-again').status, 0);
      }
      const opened = run.ok('gate', run.task, 'produce/greet-text');
      assert.match(opened, new RegExp(`^⇧ model {4}produce/greet-text {4}level 3→4 · \\S+/high → ${expensive.replace('.', '\\.')}/high · C1: output lacks the expected text #\\d+ · gate 6/6 · escalation\\.md$`, 'm'));
      const text = readFileSync(record, 'utf8');
      for (let n = 1; n <= 6; n++) assert.match(text, new RegExp(`^${n}\\. PASS — `, 'm'), `${host}: condition ${n}`);
      assert.match(text, /\| 3 \| 3 \| \S+\/high \| FAIL\(check\) \|/);
      const before = run.used();
      const [d] = dispatches(run.dispatch());
      assert.deepEqual([d.model, d.effort], [expensive, 'high'], `${host}: expensive take`);
      assert.equal(run.used() - before, host === 'claude' ? 8 : 4, `${host}: expensive call weight`);
      bad(run, 'greet-text', minimum + 1, 'C1', 'greet', 'still wrong', 'hello, world');
      run.result('produce/greet-text', 'DONE');
      assert.match(run.log(), /■ stopped {2}produce\/greet-text .* the one expensive take ended without a pass/);
    }
  });

  it('refuses a failure that is not a capability failure, and an expensive call the budget cannot carry', (t) => {
    const run = startRun(t);
    climb(run, { classify: false });
    assert.equal(run.diagnose('produce/greet-text', ['class: omission', 'The brief never mentioned the comma.']).status, 0);
    assert.match(run.ok('gate', run.task, 'produce/greet-text'), /class "omission" never escalates the model/);
    assert.notEqual(run.ledger('classify', run.task, 'produce/greet-text', 'capability', '--by', 'map/why-it-fails').status, 0, 'the diagnosis must say capability itself');
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
    assert.match(out, /✗ failed {3}produce\/greet-text .* C1: test "\$\(bin\/greet\)" = "hello, +exit 1 #\d+/);
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
    assert.match(report, /^■ run {6}done, provisional · 2\/2 items accepted · 0 unresolved · \d+:\d\d · peak 2 parallel$/m);
    assert.match(report, /^Outcome: 2\/2 items accepted, 0 unresolved; 5 units of 24 used; state: PROVISIONAL \(every item accepted, but not independently checked: no check fixed in the plan for C1 C2\)$/m);
    assert.match(report, /^ {2}C2\|PASS\|behavioral\|verify\/checks take 2 on [a-z]+-[\d-]+\|worker$/m);
    assert.match(report, /^Check basis: PROVISIONAL for C1 C2: passed only a check a worker chose, which the script re-ran but cannot judge for relevance\./m);
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
    assert.match(report, /possibly changing commands in worker records: 1 /);
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

  it('dispatches as wide as eligibility, host slots and declared limits allow, with no ceiling of its own', (t) => {
    const run = startRun(t, { tier: 'C' });
    run.plan(many(7));
    const out = run.dispatch();
    assert.equal(dispatches(out).length, 7, 'width follows capacity: no fixed writer ceiling');
    assert.equal(out.split('\n').filter((l) => /^▶ started /.test(l)).length, 7, 'every worker gets its own started line');
    const slots = startRun(t, { tier: 'C' });
    slots.plan(many(5));
    const limited = slots.dispatch('--slots', '3');
    assert.equal(dispatches(limited).length, 3);
    assert.match(limited, /^note: produce\/item-4 waits for a free slot \(3 at a time\)$/m);
    const capped = startRun(t, { tier: 'C' });
    capped.plan(`writers 3\n${many(7)}`);
    const three = capped.dispatch();
    assert.equal(dispatches(three).length, 3);
    assert.match(three, /^note: produce\/item-4 waits: the plan allows 3 writers per batch$/m);
  });

  it('serialises items whose owned outputs overlap and honours declared dependencies', (t) => {
    const run = startRun(t, { tier: 'C' });
    run.plan(`${many(3, (i) => (i === 2 ? 'bin/*' : `bin/${['one', 'two'][i]}`))}\ncriterion C4 behavioral | four\nitem produce item-4 | Change four | owns: lib/four | criteria: C4 | after: item-1`);
    const out = run.dispatch();
    assert.deepEqual(dispatches(out).map((d) => d.item), ['produce/item-1', 'produce/item-2']);
    assert.match(out, /^note: produce\/item-3 waits: its owned outputs may overlap produce\/item-1$/m);
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
    assert.match(report, /^Secrets: DETECTED in .*greet-text\/take-1\.report\.md\. Their values are withheld/m);
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

  it('does not let the failing worker classify its own failure, nor a missing record count as a reproduced failure', (t) => {
    const run = startRun(t);
    run.plan(oneItem);
    for (let take = 1; take <= 4; take++) {
      if (take === 4) run.dispatch('produce/greet-text', '--narrow', 'only the echoed text');
      else run.dispatch();
      // The worker claims a capability failure and leaves no record the script could re-run.
      if (take === 4) {
        run.write('bin/greet', '#!/usr/bin/env bash\necho nope\nexit 1\n', 0o755);
        run.record('greet-text', 4, null, 'class: capability\nreproduced: yes\ncommand: false\n');
      }
      run.result('produce/greet-text', 'FAIL', '--class', 'capability', '--sig', `too hard ${take}`);
    }
    assert.equal(run.field('produce/greet-text', 'status'), 'need-gate');
    const refused = run.ok('gate', run.task, 'produce/greet-text');
    assert.match(refused, /^gate 4\/6 /m);
    assert.match(refused, /^3\. FAIL — failure class: capability, classified by the failing worker only \(not accepted\)\.$/m);
    assert.match(refused, /^4\. FAIL — independent confirmation: none/m);
    assert.match(refused, /^next: condition 4 — .*item map why-greet-text/m);
    assert.match(refused, /^6\. PASS — budget: used 4 \+ expensive call 8 \+ still owed \(other first takes, validation, reserve\) 3 of 24 units\.$/m);
    // The failing worker's own report is not a diagnosis, whatever it says and wherever the coordinator points.
    const own = run.ledger('classify', run.task, 'produce/greet-text', 'capability', '--evidence', run.evidence('greet-text', 'take-4.report.md'));
    assert.notEqual(own.status, 0);
    assert.match(own.stderr, /A failing worker's own report does not classify its failure/);
    // A separate diagnosis classifies, but a command that is not one of the item's checks confirms nothing.
    const loose = run.diagnose('produce/greet-text', ['class: capability', 'reproduced: yes', 'command: false'], 'why-one');
    assert.match(loose.stdout, /false is neither a plan check of this item's criteria nor a command from its check records/);
    assert.match(run.ok('gate', run.task, 'produce/greet-text'), /^gate 5\/6 /m);
    assert.doesNotMatch(run.log(), /⇧ model/);
    // The item's own plan check, re-run by the script and failing, does.
    assert.match(run.diagnose('produce/greet-text', ['class: capability', 'reproduced: yes', 'command: bin/greet'], 'why-two').stdout, /^reproduced: bin\/greet exits 1$/m);
    assert.match(run.ok('gate', run.task, 'produce/greet-text'), /⇧ model {4}produce\/greet-text/);
  });

  it('refuses a repeated correction before it costs a take, and lets one distinct retry repair gate condition 2', (t) => {
    const run = startRun(t);
    run.plan(oneItem);
    run.dispatch();
    run.result('produce/greet-text', 'FAIL', '--sig', 'same failure');
    run.dispatch('produce/greet-text', '--correction', 'Try harder');
    run.result('produce/greet-text', 'FAIL', '--sig', 'same failure');
    const used = run.used();
    const refused = run.ledger('dispatch', run.task, 'produce/greet-text', '--correction', 'Try harder');
    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /this repeats the correction given for take 2 of produce\/greet-text\. Nothing was dispatched and no take was spent/);
    assert.equal(run.used(), used);
    assert.equal(run.field('produce/greet-text', 'takes'), '2');
    // Retries without a correction of the coordinator's own repeat the automatic instruction.
    run.dispatch('produce/greet-text');
    run.result('produce/greet-text', 'FAIL', '--sig', 'same failure');
    run.dispatch('produce/greet-text', '--narrow', 'only the echoed text');
    bad(run, 'greet-text', 4, 'C1', 'greet', 'wrong', 'hello, world');
    run.result('produce/greet-text', 'DONE');
    const out = run.ok('gate', run.task, 'produce/greet-text');
    assert.match(out, /^2\. FAIL — the latest retry carried a correction of its own/m);
    assert.match(out, /^next: condition 2 — the latest retry repeated the previous instruction\. One take with a different correction meets it: ledger\.sh dispatch TASK produce\/greet-text --correction/m);
    run.dispatch('produce/greet-text', '--correction', 'Print the comma: read take-4.verdict first');
    run.result('produce/greet-text', 'FAIL', '--sig', 'still wrong');
    const again = run.ok('gate', run.task, 'produce/greet-text');
    assert.match(again, /^2\. PASS — the latest retry carried a correction of its own citing the prior record; 1 earlier retry repeated/m);
    assert.doesNotMatch(again, /condition 2/);
  });
  it('never dispatches a gated item only to stop it for budget: the gate uses the dispatch formula', (t) => {
    const run = startRun(t);
    toGate(run);
    assert.equal(run.diagnose('produce/greet-text', ['class: capability', 'reproduced: no']).status, 0);
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
      ['PARTIAL', ['--sig', 'half done'], /■ stopped {2}produce\/greet-text {4}take 5\/8 · level 4\/4 · sonnet\/high · the one expensive take ended without a pass: half done/],
      ['FAIL', ['--class', 'omission', '--sig', 'forgot a case'], /■ stopped {2}produce\/greet-text .* the one expensive take ended without a pass: forgot a case/],
      ['BLOCKED', ['--class', 'environment', '--sig', 'disk full'], /■ stopped {2}produce\/greet-text .* the one expensive take ended without a pass: disk full/],
    ]) {
      const run = startRun(t);
      toGate(run);
      assert.equal(run.diagnose('produce/greet-text', ['class: capability', 'reproduced: no']).status, 0);
      run.ok('gate', run.task, 'produce/greet-text');
      run.dispatch();
      const brief = run.brief('produce/greet-text', 5);
      assert.match(brief, /^# Escalated brief \(the one take on the stronger model\)/);
      assert.match(brief, /^Escalation record \(why earlier takes failed\): .*\/evidence\/greet-text\/escalation\.md$/m);
      assert.doesNotMatch(brief, /Narrowed scope/);
      const used = run.used();
      assert.match(run.result('produce/greet-text', outcome, ...args), expected);
      assert.notEqual(run.ledger('answer', run.task, 'produce/greet-text', 'the service is back').status, 0, `${outcome}: nothing re-opens the item`);
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
      const sent = dispatches(run.dispatch()).map((d) => d.item);
      // The checks validator passed in the first cycle; only the reviewer still owes a verdict on this state.
      assert.deepEqual(sent, take === 1 ? ['verify/checks', 'verify/review'] : ['verify/review']);
      if (take === 1) {
        run.record('checks', 1, [block('C1', 'bin/greet', 'hello, world')]);
        run.result('verify/checks', 'PASS');
      }
      const out = run.result('verify/review', 'UNUSABLE', '--sig', 'no record');
      assert.doesNotMatch(out, /✓ passed/);
    }
    assert.match(run.log(), /■ stopped {2}verify\/review {9}take 3\/4 · level 3\/3 · haiku\/high · ladder exhausted: no record/);
    assert.match(run.log(), /✗ failed {3}verify {16}0\/1 validators · a required validator was stopped, verification is incomplete/);
    const next = run.dispatch();
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
    run.record('greet-text', 1, [block('C1', 'cat bin/greet', '#!/usr/bin/env bash')]);
    assert.match(run.result('produce/greet-text', 'DONE'), /✗ failed {3}produce\/greet-text .* C1: test "\$\(bin\/greet\)" = "hello, +exit 1 #\d+/);
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
    // A worker that provably ran on other settings stops the run until the user decides.
    const refused = run.ledger('dispatch', run.task);
    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /pinning: known mismatch \(produce\/audit ran on haiku\/medium instead of haiku\/low\)\. Workers would not run on the requested model or effort, so nothing is dispatched/);
    assert.match(run.status(), /^next: pinning: known mismatch .* ledger\.sh pinning TASK accept "<what the user said>"/m);
    assert.match(run.ok('pinning', run.task, 'accept', 'go on, medium is fine'), /▶ run {6}pinning {15}relaxed by the user \(go on, medium is fine\)/);
    run.dispatch();
    run.record('audit', 2, record('./tools/bin/aws s3api list-buckets', "psql -c 'select count(*) from orders'", 'aws sts get-caller-identity'));
    run.result('produce/audit', 'DONE', '--ran', 'haiku/medium');
    assert.match(run.report(), /^Pinning: Known mismatch, accepted by the user \(produce\/audit ran on haiku\/medium instead of haiku\/low; the user: go on, medium is fine\); 0 of 2 call\(s\) shown by the host as run on the requested model generation and effort, 1 by alias only, 1 on other settings$/m);

    const verified = startRun(t, { tier: 'A' });
    verified.plan(oneItem);
    verified.dispatch();
    good(verified, 'greet-text', 1, 'C1', 'greet', 'hello, world');
    verified.result('produce/greet-text', 'DONE', '--ran', 'claude-haiku-5-5/low');
    assert.match(verified.report(), /^Pinning: Verified; 1 of 1 call\(s\) shown by the host as run on the requested model generation and effort, 0 by alias only, 0 on other settings$/m);
    // The bare alias does not show which generation ran; an older generation is a mismatch.
    const alias = startRun(t, { tier: 'A' });
    alias.plan(oneItem);
    alias.dispatch();
    good(alias, 'greet-text', 1, 'C1', 'greet', 'hello, world');
    alias.result('produce/greet-text', 'DONE', '--ran', 'haiku/low');
    assert.match(alias.report(), /^Pinning: Requested; model generation unverified \(1 call\(s\) shown by alias only\); 0 of 1 /m);
    const older = startRun(t, { tier: 'A' });
    older.plan(oneItem);
    older.dispatch();
    good(older, 'greet-text', 1, 'C1', 'greet', 'hello, world');
    assert.match(older.result('produce/greet-text', 'DONE', '--ran', 'claude-haiku-4-5/low'), /\(requested haiku\/low, ran claude-haiku-4-5\/low\)/);
    assert.match(older.report(), /^Pinning: Known mismatch \(produce\/greet-text ran on claude-haiku-4-5\/low instead of haiku\/low\); 0 of 1 /m);
    const codex = startRun(t, { tier: 'A', host: 'codex' });
    codex.plan(oneItem);
    codex.dispatch();
    good(codex, 'greet-text', 1, 'C1', 'greet', 'hello, world');
    assert.match(codex.result('produce/greet-text', 'DONE', '--ran', 'gpt-6-luna-mini/low'), /ran gpt-6-luna-mini\/low/);

    const hidden = startRun(t, { host: 'codex' });
    assert.match(hidden.init, /pinning: requested, unverified \(nothing to check from here on this host\)/);
    hidden.plan(oneItem);
    assert.match(hidden.ok('pinning', hidden.task, 'mismatch', 'spawn_agent hides model and reasoning_effort'), /⏸ blocked {2}pinning {15}known mismatch \(spawn_agent hides model and reasoning_effort\); dispatch stops until the user decides/);
    assert.notEqual(hidden.ledger('dispatch', hidden.task).status, 0, 'a known mismatch is not run as best effort');
    hidden.ok('pinning', hidden.task, 'accept', 'use the configured default');
    const block1 = hidden.dispatch();
    assert.match(block1, /^dispatch produce\/greet-text \| model=gpt-6-luna \| reasoning_effort=low \| barrier=no \| continue=no$/m);
    assert.doesNotMatch(block1, /\beffort=low \| background|prompt|one message/);
    good(hidden, 'greet-text', 1, 'C1', 'greet', 'hello, world');
    hidden.result('produce/greet-text', 'DONE');
    hidden.ok('stop', hidden.task, 'verify/checks', 'not needed for this test');
    assert.match(hidden.report(), /^Pinning: Known mismatch, accepted by the user \(spawn_agent hides model and reasoning_effort; the user: use the configured default\)/m);
  });

  it('treats a fallback-only subagent model as no mismatch and names a forced one', (t) => {
    assert.match(startRun(t, { env: { CLAUDE_CODE_SUBAGENT_MODEL: 'haiku' } }).init, /pinning: requested, unverified/);
    const forced = startRun(t, { env: { CLAUDE_CODE_SUBAGENT_MODEL: 'opus', CLAUDE_CODE_SUBAGENT_MODEL_FORCE: '1' } });
    assert.match(forced.init, /pinning: KNOWN MISMATCH — CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1 \(forced model: opus\)/);
    assert.match(forced.plan(oneItem), /pinning: known mismatch \(CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1 \(forced model: opus\)\)$/m);
    assert.match(startRun(t, { env: { CLAUDE_CODE_EFFORT_LEVEL: 'low' } }).init, /KNOWN MISMATCH — CLAUDE_CODE_EFFORT_LEVEL=low/);
  });
});

describe('second review regressions', () => {
  const produced = (run, plan = oneItem) => {
    run.plan(plan);
    run.dispatch();
    good(run, 'greet-text', 1, 'C1', 'greet', 'hello, world');
    run.result('produce/greet-text', 'DONE');
  };
  const reviewPass = 'criterion: R1\nverdict: PASS\ntype: inspection\ncite: bin/greet:2\ndecisive: echo "hello, world"';

  it('never accepts a PASS whose check exits non-zero, whatever exit status the worker declares', (t) => {
    const run = startRun(t);
    run.plan('criterion C1 behavioral | greeting must be correct | check: bin/greet\nitem produce greet-text | Fix greeting | owns: bin/greet | criteria: C1');
    run.dispatch();
    run.write('bin/greet', '#!/usr/bin/env bash\necho FAIL\nexit 1\n', 0o755);
    run.record('greet-text', 1, [block('C1', 'bin/greet', 'FAIL', { exit: 1 })]);
    const out = run.result('produce/greet-text', 'DONE');
    assert.match(out, /✗ failed {3}produce\/greet-text .* C1: bin\/greet exit 1 #\d+/);
    assert.doesNotMatch(out, /✓ done/);
    assert.match(run.report(), /^Outcome: 0\/1 items accepted, 1 unresolved; .* state: incomplete/m);
  });

  it('refuses a check that only prints fixed text, and names criteria that passed only on a worker-chosen check', (t) => {
    const run = startRun(t);
    run.plan('criterion C1 behavioral | bin/greet prints correct\nitem produce greet-text | Fix it | owns: bin/greet | criteria: C1');
    run.dispatch();
    run.record('greet-text', 1, [block('C1', 'echo correct', 'correct')]);
    assert.match(run.result('produce/greet-text', 'DONE'), /C1: echo correct only prints fixed text: it does not exercise th/);
    run.dispatch();
    good(run, 'greet-text', 2, 'C1', 'greet', 'correct');
    run.result('produce/greet-text', 'DONE');
    run.dispatch();
    run.record('checks', 1, [block('C1', 'printf correct; true', 'correct')]);
    assert.match(run.result('verify/checks', 'PASS'), /unsupported record: C1: printf correct; true only prints fixed text/);
    run.dispatch();
    run.record('checks', 2, [block('C1', 'bin/greet', 'correct')]);
    run.result('verify/checks', 'PASS');
    const report = run.report();
    assert.match(report, /^ {2}C1\|PASS\|behavioral\|verify\/checks take 2 on \S+\|worker$/m);
    assert.match(report, /^Check basis: PROVISIONAL for C1: passed only a check a worker chose, /m);
    assert.match(report, /state: PROVISIONAL \(every item accepted, but not independently checked: no check fixed in the plan for C1\)$/m);
    const bound = startRun(t);
    produced(bound);
    bound.dispatch();
    bound.record('checks', 1, [block('C1', 'bin/greet', 'hello, world')]);
    bound.result('verify/checks', 'PASS');
    assert.match(bound.report(), /^Check basis: every executed or collected criterion passed a check fixed in the plan\. A plan check is trusted as written/m);
  });

  it('does not accept work whose required check was not run', (t) => {
    const run = startRun(t);
    produced(run);
    const notRun = [block('C1', 'bin/greet', 'hello, world', { verdict: 'NOT_RUN', class: 'environment', reason: 'database unavailable' })];
    for (let take = 1; take <= 3; take++) {
      run.dispatch();
      run.record('checks', take, notRun);
      const out = run.result('verify/checks', 'PASS');
      assert.doesNotMatch(out, /✓ passed/);
      assert.match(out, /✗ failed {3}verify\/checks .* required check not run: C1/);
    }
    assert.equal(run.field('verify/checks', 'status'), 'blocked', 'an environment problem blocks; it never passes and never raises effort');
    assert.equal(run.field('verify/checks', 'level'), '1');
    const report = run.report();
    assert.match(report, /^Outcome: 0\/1 items accepted, 1 unresolved; .* state: incomplete \(produce\/greet-text is done\)$/m);
    assert.match(report, /^ {2}produce\/greet-text: produced, not verified$/m);
  });

  it('needs the whole validator roster on one frozen state: tier D with one slot is not accepted on one validator', (t) => {
    const run = startRun(t, { tier: 'D' });
    produced(run);
    const only = run.dispatch('--slots', '1');
    assert.deepEqual(dispatches(only).map((d) => d.item), ['verify/checks']);
    run.record('checks', 1, [block('C1', 'bin/greet', 'hello, world')]);
    const first = run.result('verify/checks', 'PASS');
    assert.doesNotMatch(first, /✓ passed/);
    assert.match(first, /^note: verification is not complete: no supported PASS on \S+ yet from verify\/review$/m);
    assert.match(first, /^next: ledger\.sh dispatch TASK {3}\(ready: verify\/review\)$/m);
    assert.match(run.report(), /^Outcome: 0\/1 items accepted, 1 unresolved; .* state: incomplete/m);
    assert.deepEqual(dispatches(run.dispatch()).map((d) => d.item), ['verify/review'], 'the validator that already passed this state is not paid again');
    run.record('review', 1, [reviewPass]);
    assert.match(run.result('verify/review', 'PASS'), /✓ passed {3}verify {16}2\/2 validators · 2\/2 criteria · units 3\/36/);
    assert.match(run.report(), /^Outcome: 1\/1 items accepted, 0 unresolved; 3 units of 36 used; state: complete$/m);
  });

  it('never executes a recorded command that may change an external system, and counts what it refused', (t) => {
    const run = startRun(t, { kind: 'infra' });
    const marker = join(run.root, 'external-change');
    run.write('tools/aws', `#!/usr/bin/env bash\nprintf deleted > '${marker}'\necho removed\n`, 0o755);
    assert.match(run.planFails('criterion C1 behavioral | inventory correct | check: tools/aws s3api delete-bucket\nitem produce inventory | Inventory | owns: report.txt | criteria: C1'), /criterion C1: its check may change an external system and the script would run it/);
    run.plan('criterion C1 behavioral | inventory correct\ncriterion C2 behavioral | versioning read\nitem produce inventory | Inventory | owns: report.txt | criteria: C1,C2');
    run.dispatch();
    run.write('report.txt', 'two buckets\n');
    run.record('inventory', 1, [block('C1', 'tools/aws s3api delete-bucket', 'removed'), block('C2', 'tools/aws s3api get-bucket-versioning', 'removed')]);
    const out = run.result('produce/inventory', 'DONE');
    assert.match(out, /C1: not run: the command may change an external system; C2: not run: i/);
    assert.equal(existsSync(marker), false, 'the script did not run the worker’s command');
    const report = run.report();
    assert.match(report, /commands the script ran itself: 0 .*; commands it refused to run: 2 .*\. The screen is a heuristic, not proof of no external change$/m);
    // A read-only external check the plan itself fixes is run.
    const fixed = startRun(t, { kind: 'infra' });
    fixed.write('tools/aws', '#!/usr/bin/env bash\necho Enabled\n', 0o755);
    fixed.plan('criterion C1 behavioral | versioning is on | check: tools/aws s3api get-bucket-versioning | expect: Enabled\nitem produce inventory | Inventory | owns: report.txt | criteria: C1');
    fixed.dispatch();
    fixed.write('report.txt', 'on\n');
    fixed.record('inventory', 1, [block('C1', 'tools/aws s3api get-bucket-versioning', 'Enabled')]);
    assert.match(fixed.result('produce/inventory', 'DONE'), /✓ done {5}produce\/inventory/);
  });

  it('keeps a detected secret out of the plan, the briefs, the log and the report', (t) => {
    const secret = 'review_fake_token_12345678901234567890';
    const run = startRun(t, { env: { EVAL_API_TOKEN: secret } });
    const refused = run.planFails(`decision token=${secret}\n${oneItem}`);
    assert.match(refused, /line 1 holds the value of \$EVAL_API_TOKEN; name the variable instead of writing its value\. Nothing was stored\./);
    assert.doesNotMatch(refused, /review_fake/);
    assert.equal(existsSync(join(run.task, 'decisions.md')), false);
    run.plan(oneItem);
    run.dispatch();
    const failed = run.result('produce/greet-text', 'BLOCKED', '--class', 'ambiguity', '--sig', `which token, ${secret}?`);
    assert.doesNotMatch(failed, /review_fake/);
    assert.match(failed, /which token, \[withheld:EVAL_API_TOKEN\]\?/);
    assert.notEqual(run.ledger('answer', run.task, 'produce/greet-text', `use ${secret}`).status, 0);
    run.ok('answer', run.task, 'produce/greet-text', 'use the configured one');
    run.dispatch();
    good(run, 'greet-text', 2, 'C1', 'greet', 'hello, world');
    run.result('produce/greet-text', 'DONE');
    const report = run.report('--external', `pushed with ${secret}`);
    assert.doesNotMatch(report, /review_fake/);
    assert.match(report, /^External actions: pushed with \[withheld:EVAL_API_TOKEN\];/m);
    for (const file of ['log.txt', 'report.md', 'ledger.tsv', 'briefs/produce.greet-text.take-2.md']) {
      assert.doesNotMatch(readFileSync(join(run.task, file), 'utf8'), /review_fake/, file);
    }
    const key = startRun(t);
    assert.match(key.planFails('decision use AKIAABCDEFGHIJKLMNOP for the audit'), /line 1 holds a key or token/);
  });

  it('serialises globs that can match the same path and items that share a lock, and runs provably disjoint globs together', (t) => {
    const run = startRun(t, { tier: 'C' });
    run.plan('criterion C1 behavioral | a\ncriterion C2 behavioral | b\ncriterion C3 behavioral | c\ncriterion C4 behavioral | d\nitem produce first | a | owns: src/*.ts | criteria: C1\nitem produce second | b | owns: src/foo.* | criteria: C2\nitem produce third | c | owns: out/*.csv | criteria: C3\nitem produce fourth | d | owns: out/*.json,lib/ | criteria: C4');
    const out = run.dispatch();
    assert.deepEqual(dispatches(out).map((d) => d.item), ['produce/first', 'produce/third', 'produce/fourth']);
    assert.match(out, /^note: produce\/second waits: its owned outputs may overlap produce\/first$/m);
    const locked = startRun(t, { tier: 'C' });
    locked.plan('criterion C1 behavioral | a\ncriterion C2 behavioral | b\nitem produce first | a | owns: a/ | criteria: C1 | locks: test-db\nitem produce second | b | owns: b/ | criteria: C2 | locks: port-3000,test-db');
    const one = locked.dispatch();
    assert.deepEqual(dispatches(one).map((d) => d.item), ['produce/first']);
    assert.match(one, /^note: produce\/second waits: it shares a lock with produce\/first$/m);
  });

  it('blocks on a change nobody dispatched, never reverts it, and validates again once it is accepted', (t) => {
    const run = startRun(t);
    produced(run);
    run.write('README.md', 'edited by the user between batches\n');
    const blocked = run.dispatch();
    assert.match(blocked, /^✗ failed {3}workspace {13}changed outside any dispatch: README\.md/m);
    assert.match(blocked, /^next: nothing was dispatched\. The script never reverts them\..* ledger\.sh drift TASK accept "<who and why>"/m);
    assert.equal(dispatches(blocked).length, 0);
    assert.equal(run.used(), 1);
    assert.notEqual(run.ledger('dispatch', run.task).status, 0);
    assert.match(run.status(), /^acceptance: incomplete \(changes outside any dispatch unresolved\)$/m);
    assert.match(run.ok('drift', run.task, 'accept', 'the user fixed a typo'), /^note: recorded\. Validation runs again on the changed state\.$/m);
    assert.equal(readFileSync(join(run.workspace, 'README.md'), 'utf8'), 'edited by the user between batches\n');
    const [v] = dispatches(run.dispatch());
    assert.equal(v.item, 'verify/checks');
    assert.match(readFileSync(run.brief('verify/checks', 1).match(/^Integrated patch: (.*)$/m)[1], 'utf8'), /edited by the user between batches/, 'the validator sees the accepted change');
    run.record('checks', 1, [block('C1', 'bin/greet', 'hello, world')]);
    run.result('verify/checks', 'PASS');
    const report = run.report();
    assert.match(report, /state: complete$/m);
    assert.match(report, /changes between batches outside any dispatch: README\.md \(accepted: the user fixed a typo\)/);
    // A later report looks at the workspace again: an edit after validation invalidates the result.
    run.setScript('greet', 'changed after the final report');
    const again = run.report();
    assert.match(again, /^Outcome: 1\/1 items accepted, 0 unresolved; 2 units of 24 used; state: INVALID \(the workspace changed after validation: what was accepted is not what is on disk\)$/m);
    assert.match(again, /changes after validation: bin\/greet /);
    assert.match(again, /^■ run {6}ended: the workspace changed after validation · /m);
  });

  it('rejects a check that writes workspace files instead of absorbing the write into the accepted state', (t) => {
    const plan = (extra = '') => `${extra}criterion C1 behavioral | greets | check: bin/greet > cache.out; cat cache.out | expect: hello, world\nitem produce greet-text | Fix it | owns: bin/greet | criteria: C1`;
    const run = startRun(t);
    run.plan(plan());
    run.dispatch();
    good(run, 'greet-text', 1, 'C1', 'greet', 'hello, world');
    const out = run.result('produce/greet-text', 'DONE');
    assert.match(out, /✗ failed {3}produce\/greet-text .* a check changed workspace files \(cache\.out\): checks may write only to/);
    assert.doesNotMatch(out, /✓ done/);
    const refused = run.dispatch();
    assert.match(refused, /^✗ failed {3}workspace {13}changed outside any dispatch: cache\.out/m);
    assert.match(refused, /^next: nothing was dispatched\. A check the script re-ran wrote files \(cache\.out ?\): .* plan line: scratch GLOB\. /m);
    assert.match(run.report(), /files written by checks the script re-ran \(never accepted silently\): cache\.out/);
    // The plan may release a path for checks to write.
    const released = startRun(t);
    released.plan(plan('scratch cache.out\n'));
    released.dispatch();
    good(released, 'greet-text', 1, 'C1', 'greet', 'hello, world');
    assert.match(released.result('produce/greet-text', 'DONE'), /✓ done {5}produce\/greet-text/);
    assert.equal(dispatches(released.dispatch())[0].item, 'verify/checks');
  });

  it('frees the reservation of stopped items, and keeps a declared limit below the host’s slots', (t) => {
    const run = startRun(t);
    run.plan(`criterion C1 behavioral | correct\n${Array.from({ length: 25 }, (_, i) => `item produce i${i} | Fix ${i} | owns: f${i} | criteria: C1`).join('\n')}`);
    for (let i = 1; i < 25; i++) run.ok('stop', run.task, `produce/i${i}`, 'merged into i0');
    assert.deepEqual(dispatches(run.dispatch()).map((d) => d.item), ['produce/i0']);
    const limited = startRun(t, { host: 'codex', kind: 'infra' });
    limited.plan('limit 1\nitem map first | account A\nitem map second | account B\nitem map third | account C');
    const out = limited.dispatch('--slots', '3');
    assert.deepEqual(dispatches(out).map((d) => d.item), ['map/first']);
    assert.match(limited.status(), /^width: host slots 3 · plan limit 1 · throttle 0 \(0 = none\)$/m);
    limited.result('map/first', 'BLOCKED', '--class', 'throttle', '--sig', 'rate limited');
    assert.match(limited.status(), /^width: host slots 3 · plan limit 1 · throttle 1 /m);
    const tight = startRun(t, { tier: 'A' });
    tight.plan(oneItem);
    writeFileSync(join(tight.task, 'run/used'), '14\n');
    assert.match(tight.dispatch(), /^next: no planned item fits what is left of the budget\./m);
  });

  it('after a compaction closes a take only for workers the coordinator names as ended in the host', (t) => {
    const run = startRun(t);
    run.plan(twoItems);
    assert.match(run.dispatch(), /as each one starts, record the id the host gave it: ledger\.sh bind TASK STAGE\/SLUG <worker id>/);
    assert.match(run.ok('bind', run.task, 'produce/greet-text', 'agent-11aa'), /^bound produce\/greet-text take 1 to worker agent-11aa$/m);
    good(run, 'greet-text', 1, 'C1', 'greet', 'hello, world');
    run.record('greet-text', 1, [block('C1', 'bin/greet', 'hello, world')], 'Changed bin/greet.\n\noutcome: DONE\nrecord: here\nopen: none\n');
    // A finished report file is not proof that the worker stopped: nothing is recorded from it alone.
    const out = run.ok('reconcile', run.task);
    assert.match(out, /^note: produce\/greet-text take 1 runs in worker agent-11aa; report file present\. Look it up in the host: .* ledger\.sh reconcile TASK --stopped produce\/greet-text$/m);
    assert.match(out, /^note: produce\/farewell-text take 1 runs in a worker whose id was never recorded; report file not written\./m);
    assert.match(out, /^next: nothing is dispatched while a worker of this batch may still be writing\. If the host cannot show or stop a worker listed above, tell the user/m);
    assert.equal(run.field('produce/greet-text', 'status'), 'running');
    assert.match(run.status(), /^produce\/greet-text .* · worker: agent-11aa$/m);
    const one = run.ok('reconcile', run.task, '--stopped', 'produce/greet-text');
    assert.match(one, /^note: produce\/greet-text finished with DONE according to its report file; recording it$/m);
    assert.equal(run.field('produce/greet-text', 'status'), 'returned');
    assert.equal(run.field('produce/farewell-text', 'status'), 'running');
    run.record('farewell-text', 1, null, 'Half way.\n\noutcome: PARTIAL\nclass: omission\nsignature: ran out of time\n');
    const closed = run.ok('reconcile', run.task, '--stopped', 'produce/farewell-text');
    assert.match(closed, /✓ done {5}produce\/greet-text/);
    assert.match(closed, /▶ retry {4}produce\/farewell-text same level · continue: ran out of time/);
    assert.notEqual(run.ledger('reconcile', run.task).status, 0, 'nothing to reconcile once the batch is closed');
    // A worker the host shows as ended without a report is recorded as lost.
    const lost = startRun(t);
    lost.plan(oneItem);
    lost.dispatch();
    assert.match(lost.ok('reconcile', lost.task, '--stopped', 'produce/greet-text'), /^note: produce\/greet-text ended without a finished report for take 1; recording it as lost$/m);
    assert.equal(lost.field('produce/greet-text', 'last_outcome'), 'UNUSABLE');
    // A worker id given with a result survives on disk for a later continuation.
    const kept = startRun(t);
    kept.plan(oneItem);
    kept.dispatch();
    kept.result('produce/greet-text', 'PARTIAL', '--sig', 'half done', '--worker', 'agent-7f3a');
    assert.match(kept.status(), /^produce\/greet-text .* · worker: agent-7f3a$/m);
    const cont = kept.dispatch();
    assert.equal(dispatches(cont)[0].continue, 'same-worker');
    assert.match(cont, /^note: produce\/greet-text continues in worker agent-7f3a; if that worker is gone, start a new one with the same two lines$/m);
  });
});

describe('third review regressions', () => {
  it('judges a plan check only by its own output, whatever else the worker ran or printed', (t) => {
    for (const tier of ['A', 'B']) {
      const run = startRun(t, { tier, plain: tier === 'A' });
      run.plan('criterion C1 behavioral | bin/greet prints correct | check: bin/greet | expect: correct\nitem produce greet-text | Fix it | owns: bin/greet | criteria: C1');
      run.dispatch();
      run.setScript('greet', 'WRONG');
      run.record('greet-text', 1, [block('C1', 'bin/greet; echo correct', 'correct')]);
      const out = run.result('produce/greet-text', 'DONE');
      assert.match(out, /✗ failed {3}produce\/greet-text .* C1: output lacks the expected text #\d+/, tier);
      assert.doesNotMatch(out, /✓ (done|passed)/, tier);
      assert.match(run.report(), /state: incomplete/, tier);
    }
  });

  it('sees through a shell wrapper around fixed text, and a missing command is not a result', (t) => {
    for (const [command, reason] of [
      ["bash -c 'echo correct'", /only prints fixed text/],
      ['sh -c "printf correct"', /only prints fixed text/],
      ["eval 'echo correct'", /only prints fixed text/],
      ['true', /only prints fixed text/],
      ['bin/absent', /check could not start: bin\/absent exit 127/],
    ]) {
      const run = startRun(t);
      run.plan('criterion C1 behavioral | bin/greet prints correct\nitem produce greet-text | Fix it | owns: bin/greet | criteria: C1');
      run.dispatch();
      run.record('greet-text', 1, [block('C1', command, 'correct')]);
      assert.match(run.result('produce/greet-text', 'DONE'), reason, command);
    }
  });

  it('does not let a validator’s check change the frozen state it is validating', (t) => {
    const run = startRun(t);
    run.plan(twoItems);
    run.dispatch();
    good(run, 'greet-text', 1, 'C1', 'greet', 'hello, world');
    good(run, 'farewell-text', 1, 'C2', 'farewell', 'goodbye, world');
    run.result('produce/greet-text', 'DONE');
    run.result('produce/farewell-text', 'DONE');
    run.dispatch();
    run.record('checks', 1, [
      block('C1', "bin/greet; echo 'changed by validator check' > bin/farewell", 'hello, world'),
      block('C2', 'bin/farewell', 'changed by validator check'),
    ]);
    const out = run.result('verify/checks', 'PASS');
    assert.match(out, /unsupported record: a check changed workspace files \(bin\/farewell\)/);
    assert.doesNotMatch(run.log(), /✓ passed/);
    assert.match(run.dispatch(), /changed outside any dispatch: bin\/farewell/);
    const report = run.report();
    assert.match(report, /state: incomplete \(changes outside any dispatch unresolved\)$/m);
    assert.match(report, /validated snapshot none;/);
  });

  it('never executes a network or cloud command a worker chose, in any kind of run', (t) => {
    for (const kind of ['infra', 'code', 'data']) {
      const run = startRun(t, { kind });
      const marker = join(run.root, 'posted');
      run.write('tools/curl', `#!/usr/bin/env bash\nprintf posted > '${marker}'\necho created\n`, 0o755);
      run.write('tools/probe', `#!/usr/bin/env bash\nprintf probed > '${marker}'\necho created\n`, 0o755);
      run.plan('criterion C1 behavioral | resource exists\ncriterion C2 behavioral | resource readable\nitem produce inventory | Inventory | owns: report.txt | criteria: C1,C2');
      run.dispatch();
      run.record('inventory', 1, [block('C1', 'tools/curl -d payload https://example.invalid/resource', 'created'), block('C2', 'tools/curl https://example.invalid/resource', 'created')]);
      const out = run.result('produce/inventory', 'DONE');
      assert.match(out, /C1: not run: the command may change an external system; C2: not run: /, kind);
      assert.equal(existsSync(marker), false, `${kind}: nothing was executed`);
      if (kind !== 'infra') continue;
      // In an infra run the script executes nothing the plan did not fix, however harmless it looks.
      run.dispatch();
      run.record('inventory', 2, [block('C1', 'tools/probe', 'created'), block('C2', 'tools/probe', 'created')]);
      assert.match(run.result('produce/inventory', 'DONE'), /C1: not run: in an infra run the script executes only a check fixed in/);
      assert.equal(existsSync(marker), false, 'infra: a worker-chosen script was not executed');
    }
  });

  it('reports INVALID and exits non-zero when the final snapshot cannot be taken', (t) => {
    const run = startRun(t);
    run.plan(oneItem);
    run.dispatch();
    good(run, 'greet-text', 1, 'C1', 'greet', 'hello, world');
    run.result('produce/greet-text', 'DONE');
    run.dispatch();
    run.record('checks', 1, [block('C1', 'bin/greet', 'hello, world')]);
    run.result('verify/checks', 'PASS');
    assert.match(run.report(), /state: complete$/m);
    renameSync(join(run.workspace, '.git'), join(run.root, 'git-moved-away'));
    const broken = run.ledger('report', run.task);
    assert.equal(broken.status, 3, broken.stdout);
    assert.match(broken.stdout, /state: INVALID \(the workspace could not be compared with the validated state: /);
    assert.match(broken.stdout, /changes after validation: COULD NOT BE CHECKED;/);
    assert.match(broken.stdout, /^■ run {6}ended: the workspace could not be checked · /m);
    assert.doesNotMatch(broken.stdout, /state: complete/);
    assert.match(broken.stderr, /the snapshot helper failed/);
  });

  it('restarts an item at the cheap model on low when its criterion is replaced, even after the gate opened', (t) => {
    const run = startRun(t);
    run.plan(oneItem);
    for (let take = 1; take <= 3; take++) {
      run.dispatch();
      bad(run, 'greet-text', take, 'C1', 'greet', `wrong ${take}`, 'hello, world');
      run.result('produce/greet-text', 'DONE');
    }
    run.dispatch('produce/greet-text', '--narrow', 'only change the echoed text');
    bad(run, 'greet-text', 4, 'C1', 'greet', 'wrong 4', 'hello, world');
    run.result('produce/greet-text', 'DONE');
    assert.equal(run.diagnose('produce/greet-text', ['class: capability', 'reproduced: yes']).status, 0);
    assert.match(run.ok('gate', run.task, 'produce/greet-text'), /gate 6\/6/);
    assert.equal(run.field('produce/greet-text', 'level'), '4');
    const out = run.plan('criterion C1 behavioral | bin/greet prints "good day" | check: bin/greet | expect: good day');
    assert.match(out, /^note: criterion C1 changed: produce\/greet-text starts again at level 1 \(haiku\/low\); its earlier takes, diagnosis and gate record no longer count$/m);
    assert.equal(existsSync(run.evidence('greet-text', 'escalation.md')), false, 'the gate record no longer authorises anything');
    const [d] = dispatches(run.dispatch());
    assert.deepEqual([d.item, d.model, d.effort], ['produce/greet-text', 'haiku', 'low']);
    assert.match(run.brief('produce/greet-text', 5), /good day/);
    // The gate does not count the takes made against the old criterion.
    bad(run, 'greet-text', 5, 'C1', 'greet', 'wrong 5', 'good day');
    run.result('produce/greet-text', 'DONE');
    assert.equal(run.field('produce/greet-text', 'level'), '2');
    assert.notEqual(run.ledger('gate', run.task, 'produce/greet-text').status, 0);
    // Sending an unchanged criterion again changes nothing.
    assert.doesNotMatch(run.plan('criterion C1 behavioral | bin/greet prints "good day" | check: bin/greet | expect: good day'), /changed/);
    assert.equal(run.field('produce/greet-text', 'level'), '2');
  });

  it('keeps secrets out of the evidence it writes: worker-chosen checks run without them and output is filtered', (t) => {
    const secret = 'review_fake_token_12345678901234567890';
    const run = startRun(t, { env: { REVIEW_API_TOKEN: secret } });
    writeFileSync(join(run.root, 'held-elsewhere'), `${secret}\n`);
    run.write('tools/leak', `#!/usr/bin/env bash\ncat '${join(run.root, 'held-elsewhere')}'\necho correct\n`, 0o755);
    run.plan('criterion C1 behavioral | prints correct\ncriterion C2 behavioral | also correct\nitem produce greet-text | Fix it | owns: bin/greet | criteria: C1,C2');
    run.dispatch();
    run.record('greet-text', 1, [block('C1', 'printenv REVIEW_API_TOKEN; bin/greet', 'greet'), block('C2', 'tools/leak', 'correct')]);
    const out = run.result('produce/greet-text', 'DONE');
    assert.match(out, /C2: the output of tools\/leak held a secret \(withheld\); the record does/);
    assert.doesNotMatch(out, /C1:/, 'the worker-chosen check ran without the variable and passed on its own output');
    for (const c of ['C1', 'C2']) assert.doesNotMatch(readFileSync(run.evidence('greet-text', `take-1.${c}.out`), 'utf8'), new RegExp(secret));
    assert.match(readFileSync(run.evidence('greet-text', 'take-1.C2.out'), 'utf8'), /\[withheld:REVIEW_API_TOKEN\]\ncorrect/);
    assert.match(run.report(), /^Secrets: none detected/m);
  });
});

describe('fourth review regressions', () => {
  it('runs the plan’s check whatever the evidence type: a saved file cannot stand in for it', (t) => {
    const run = startRun(t, { kind: 'infra' });
    run.plan('criterion C1 command-output | The CLI returns GOOD | check: bin/greet | expect: GOOD\nitem produce inventory | Record the setting | owns: inventory.txt | criteria: C1');
    run.dispatch();
    run.write('inventory.txt', 'GOOD\n');
    const invented = run.evidence('inventory', 'invented.txt');
    const rec = block('C1', 'bin/greet', 'GOOD', { type: 'command-output', saved: invented });
    run.record('inventory', 1, [rec]);
    writeFileSync(invented, 'GOOD\n');
    assert.match(run.result('produce/inventory', 'DONE'), /✗ failed {3}produce\/inventory .*C1: output lacks the expected text/);
    assert.match(readFileSync(join(run.task, 'commands.log'), 'utf8'), /\tbin\/greet$/m);
    assert.match(run.report(), /state: incomplete \(produce\/inventory is retry\)/);
  });

  it('reports evidence a worker saved as provisional, and makes a validator collect its own', (t) => {
    const run = startRun(t, { kind: 'infra' });
    run.plan('criterion C1 command-output | The account has the assets bucket\ncriterion C2 inspection | The report names it\nitem produce inventory | Write the report | owns: report.txt | criteria: C1,C2');
    run.dispatch();
    run.write('report.txt', 'assets\n');
    const mine = run.evidence('inventory', 'buckets.json');
    const blocks = (saved) => [
      block('C1', 'aws s3api list-buckets', '"assets"', { type: 'command-output', saved }),
      'criterion: C2\nverdict: PASS\ntype: inspection\ncite: report.txt:1\ndecisive: assets',
    ];
    run.record('inventory', 1, blocks(mine));
    writeFileSync(mine, '{"Name": "assets"}\n');
    run.result('produce/inventory', 'DONE');
    run.dispatch();
    run.record('checks', 1, blocks(mine));
    assert.match(run.result('verify/checks', 'PASS'), /unsupported record: C1: a validator collects its own evidence: save it under /);
    run.dispatch();
    const own = run.evidence('checks', 'buckets.json');
    run.record('checks', 2, blocks(own));
    writeFileSync(own, '{"Name": "assets"}\n');
    run.result('verify/checks', 'PASS');
    const report = run.report();
    assert.match(report, /state: PROVISIONAL \(every item accepted, but not independently checked: only evidence a worker saved for C1\)$/m);
    assert.match(report, /^ {2}C1\|PASS\|command-output\|verify\/checks take 2 on \S+\|saved$/m);
    assert.match(report, /^Check basis: PROVISIONAL for C1: accepted on output or a source copy a worker saved; .*By inspection only \(a validator read the cited lines; the script confirmed they exist, not what they mean\): C2\./m);
    assert.match(run.log(), /done, provisional/);
  });

  it('refuses a plan check that only prints fixed text', (t) => {
    const run = startRun(t, { tier: 'A' });
    for (const check of ['echo GOOD', "bash -c 'printf GOOD'", 'true']) {
      const err = run.planFails(`criterion C1 behavioral | bin/greet prints GOOD | check: ${check} | expect: GOOD\nitem produce greeting | Make it good | owns: bin/greet | criteria: C1`);
      assert.match(err, /line 1: the check of criterion C1 only prints fixed text or returns a fixed status, so it cannot fail when the work is wrong/, check);
    }
    assert.ok(!existsSync(join(run.task, 'criteria/C1')));
  });

  it('is not complete while a criterion added after validation is unverified or unowned', (t) => {
    const run = startRun(t);
    run.plan(oneItem);
    run.dispatch();
    good(run, 'greet-text', 1, 'C1', 'greet', 'hello, world');
    run.result('produce/greet-text', 'DONE');
    run.dispatch();
    run.record('checks', 1, [block('C1', 'bin/greet', 'hello, world')]);
    run.result('verify/checks', 'PASS');
    assert.match(run.status(), /^acceptance: complete$/m);
    const added = run.plan('criterion C2 behavioral | bin/farewell prints "goodbye, world" | check: bin/farewell | expect: goodbye, world');
    assert.match(added, /^note: criterion C2 was added after work was validated: nothing counts as accepted until it is verified too$/m);
    assert.match(added, /^note: no produce item covers criterion C2: the run cannot complete until one does/m);
    assert.match(added, /^next: ledger\.sh dispatch TASK {3}\(ready: verify\/checks\)$/m);
    assert.match(run.status(), /^acceptance: incomplete \(produce\/greet-text is done\)$/m);
    const early = run.report();
    assert.match(early, /state: incomplete/);
    assert.match(early, /^ {2}produce\/greet-text: produced, not verified$/m);
    // The validator is asked for the new criterion too, and its failure is nobody's item yet.
    run.dispatch();
    assert.match(run.brief('verify/checks', 2), /^Your criteria: C1,C2$/m);
    run.record('checks', 2, [block('C1', 'bin/greet', 'hello, world'), block('C2', 'bin/farewell', 'goodbye, world', { verdict: 'FAIL', exit: 1 })]);
    assert.match(run.result('verify/checks', 'PASS'), /unsupported record: C2: reported FAIL but bin\/farewell exits 0/);
    run.plan('item produce farewell-text | Make bin/farewell print goodbye, world | owns: bin/farewell | criteria: C2');
    run.dispatch();
    good(run, 'farewell-text', 1, 'C2', 'farewell', 'goodbye, world');
    run.result('produce/farewell-text', 'DONE');
    run.dispatch();
    run.record('checks', 3, [block('C1', 'bin/greet', 'hello, world'), block('C2', 'bin/farewell', 'goodbye, world')]);
    run.result('verify/checks', 'PASS');
    assert.match(run.report(), /^Outcome: 2\/2 items accepted, 0 unresolved; \d+ units of 24 used; state: complete$/m);
  });

  it('treats an authorisation as covering exactly the command written, not one contained in it', (t) => {
    const run = startRun(t, { tier: 'A', kind: 'infra' });
    const marker = join(run.root, 'external-change');
    run.write('tools/aws', `#!/usr/bin/env bash\nprintf 'invoked %s\\n' "$*" >> '${marker}'\necho changed\n`, 0o755);
    const item = 'item produce inventory | Inventory | owns: report.txt | criteria: C1';
    const dry = './tools/aws ec2 terminate-instances --instance-ids i-test --dry-run';
    for (const check of ['./tools/aws ec2 terminate-instances --instance-ids i-test', './tools/aws ec2 terminate-instances --instance-ids i-other --dry-run', `${dry}; ./tools/aws ec2 terminate-instances --instance-ids i-test`]) {
      const err = run.planFails(`allow ${dry}\ncriterion C1 behavioral | Instances inspected | check: ${check} | expect: changed\n${item}`);
      assert.match(err, /criterion C1: its check may change an external system and the script would run it/, check);
    }
    assert.ok(!existsSync(marker), 'nothing ran');
    run.plan(`allow ${dry}\ncriterion C1 behavioral | Instances inspected | check: ${dry} | expect: changed\n${item}`);
    run.dispatch();
    run.record('inventory', 1, [block('C1', dry, 'changed')]);
    assert.match(run.result('produce/inventory', 'DONE'), /✓ done {5}produce\/inventory/);
    assert.equal(readFileSync(marker, 'utf8'), 'invoked ec2 terminate-instances --instance-ids i-test --dry-run\n');
  });

  it('withholds a detected secret from the patch validators read, and accepts nothing while a produced file holds it', (t) => {
    const secret = 'review-fixture-token-123456';
    const run = startRun(t, { env: { REVIEW_TEST_TOKEN: secret } });
    run.plan('criterion C1 inspection | The report has its header\nitem produce findings | Write the report | owns: report.txt | criteria: C1\nitem produce greet-text | Leave greet alone | owns: bin/greet | criteria: C1');
    const inspect = 'criterion: C1\nverdict: PASS\ntype: inspection\ncite: report.txt:1\ndecisive: safe header';
    run.dispatch();
    run.write('report.txt', `safe header\n${secret}\n`);
    run.record('findings', 1, [inspect]);
    run.record('greet-text', 1, [inspect]);
    run.result('produce/findings', 'DONE');
    const out = run.result('produce/greet-text', 'DONE');
    assert.match(out, /✗ failed {3}batch 1 {15}produced files hold a detected secret \(value withheld\): report\.txt/);
    assert.match(out, /✗ failed {3}produce\/findings .*an owned file holds a detected secret/);
    assert.match(out, /✓ done {5}produce\/greet-text/, 'the item that does not own the file is not blamed');
    const patch = join(run.task, 'evidence/integrated-post-1.patch');
    assert.doesNotMatch(readFileSync(patch, 'utf8'), new RegExp(secret));
    assert.match(readFileSync(patch, 'utf8'), /\+\[withheld:REVIEW_TEST_TOKEN\]/);
    assert.match(run.status(), /^acceptance: incomplete \(produced files hold a detected secret: report\.txt\)$/m);
    assert.match(run.report(), /^Secrets: PRODUCED FILES HOLD A DETECTED SECRET \(report\.txt\): not accepted until the value is removed\. a detected value was withheld from integrated-post-1\.patch/m);
    assert.equal(readFileSync(join(run.workspace, 'report.txt'), 'utf8'), `safe header\n${secret}\n`, 'the script deletes nothing');
    run.dispatch();
    assert.match(run.brief('produce/findings', 2), /^Correction: Take 1 ended FAIL: owned file holds a secret: read it from the environment\./m);
    run.write('report.txt', 'safe header\n');
    run.record('findings', 2, [inspect]);
    run.result('produce/findings', 'DONE');
    run.dispatch();
    run.record('checks', 1, [inspect]);
    run.result('verify/checks', 'PASS');
    const report = run.report();
    assert.match(report, /state: complete$/m);
    assert.match(report, /^Secrets: a detected value was withheld from integrated-post-1\.patch before validators read it\. none detected/m);
  });
});
