// Drives scripts/ledger.sh the way a coordinator would, with workers simulated by file writes.
// Lives outside test/ because `node --test` also runs every .mjs under a test/ directory.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { repoRoot } from './skill-pair.mjs';

export const ledgerPath = join(repoRoot, 'claude/skills/escalating-agents/scripts/ledger.sh');

const script = (text) => `#!/usr/bin/env bash\necho "${text}"\n`;

/** A scratch workspace (git repository unless `plain`) plus a task directory root. */
export function startRun(t, { host = 'claude', tier = 'B', kind = 'code', plain = false, env = {}, extra = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'ledger-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const workspace = join(root, 'work space');
  mkdirSync(join(workspace, 'bin'), { recursive: true });
  const baseEnv = { ...process.env, LC_ALL: 'en_US.UTF-8', GIT_CONFIG_GLOBAL: '/dev/null', ...env };
  const sh = (command, args, cwd = workspace) => spawnSync(command, args, { cwd, env: baseEnv, encoding: 'utf8', timeout: 60_000 });
  const write = (name, value, mode) => {
    mkdirSync(dirname(join(workspace, name)), { recursive: true });
    writeFileSync(join(workspace, name), value);
    if (mode) chmodSync(join(workspace, name), mode);
  };
  for (const name of ['greet', 'farewell', 'one', 'two', 'three', 'four', 'five', 'six', 'seven']) write(`bin/${name}`, script(name), 0o755);
  if (!plain) {
    for (const args of [['init', '-q'], ['add', '-A'], ['-c', 'user.email=t@example.invalid', '-c', 'user.name=t', 'commit', '-qm', 'scaffold']]) {
      const result = sh('git', args);
      assert.equal(result.status, 0, result.stderr);
    }
  }
  const ledger = (...args) => sh('bash', [ledgerPath, ...args], root);
  const ok = (...args) => {
    const result = ledger(...args);
    assert.equal(result.status, 0, `ledger ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
    return result.stdout;
  };
  const init = ok('init', '--host', host, '--tier', tier, '--kind', kind, '--workspace', workspace, '--coordinator', 'haiku/low', '--task-root', join(root, 'tasks'), ...extra);
  const task = init.match(/^TASK=(.+)$/m)?.[1];
  assert.ok(task && existsSync(task), init);
  const evidence = (slug, file) => join(task, 'evidence', slug, file);
  const run = {
    root, workspace, task, init, ledger, ok, write, sh,
    setScript: (name, text) => write(`bin/${name}`, script(text), 0o755),
    plan(text) {
      const result = spawnSync('bash', [ledgerPath, 'plan', task], { cwd: root, env: baseEnv, encoding: 'utf8', input: text, timeout: 60_000 });
      assert.equal(result.status, 0, `plan failed\n${result.stdout}\n${result.stderr}`);
      return result.stdout;
    },
    planFails(text) {
      const result = spawnSync('bash', [ledgerPath, 'plan', task], { cwd: root, env: baseEnv, encoding: 'utf8', input: text, timeout: 60_000 });
      assert.notEqual(result.status, 0, result.stdout);
      return result.stderr;
    },
    dispatch: (...args) => ok('dispatch', task, ...args),
    result: (item, outcome, ...args) => ok('result', task, item, outcome, ...args),
    status: () => ok('status', task),
    report: (...args) => ok('report', task, ...args),
    evidence,
    /** Simulate a worker's files: a report and, unless `blocks` is null, a check record. */
    record(slug, take, blocks, report = 'report\n') {
      mkdirSync(join(task, 'evidence', slug), { recursive: true });
      writeFileSync(evidence(slug, `take-${take}.report.md`), report);
      if (blocks !== null) writeFileSync(evidence(slug, `take-${take}.checks.md`), blocks.join('\n---\n'));
    },
    log: () => readFileSync(join(task, 'log.txt'), 'utf8'),
    used: () => Number(readFileSync(join(task, 'run/used'), 'utf8')),
    field: (item, name) => readFileSync(join(task, 'items', item.replace('/', '.'), name), 'utf8').trim(),
    brief: (item, take) => readFileSync(join(task, 'briefs', `${item.replace('/', '.')}.take-${take}.md`), 'utf8'),
  };
  return run;
}

/** One check-record block. */
export function block(criterion, command, decisive, extra = {}) {
  const fields = { criterion, verdict: 'PASS', type: 'behavioral', command, exit: 0, decisive, ...extra };
  return Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
}

/** Parse the `dispatch …` lines a coordinator would act on. */
export function dispatches(output) {
  return [...output.matchAll(/^dispatch (\S+) \| model=(\S+) \| (effort|reasoning_effort)=(\S+) \| barrier=(\S+) \| continue=(\S+)\n {2}(.+)\n {2}(.+)$/gm)].map(
    ([, item, model, effortName, effort, barrier, cont, first, second]) => ({ item, model, effortName, effort, barrier, continue: cont, prompt: `${first}\n${second}` }),
  );
}
