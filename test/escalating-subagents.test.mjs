import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const skills = ['claude', 'codex'].map((host) => {
  const path = fileURLToPath(new URL(`../${host}/skills/escalating-subagents/SKILL.md`, import.meta.url));
  const document = readFileSync(path, 'utf8');
  const blocks = [
    ...document.matchAll(
      /<!-- agent-snapshot:start -->\s*```bash\n([\s\S]*?)```\s*<!-- agent-snapshot:end -->/g,
    ),
  ];
  assert.equal(blocks.length, 1, `${host}: exactly one embedded snapshot script`);
  return { host, path, document, script: blocks[0][1] };
});

it('embeds identical standalone scripts in both skills', () => {
  assert.equal(skills[0].script, skills[1].script);
});

it('pins the script hash and extracts it byte-exactly with the documented command', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'agent-snapshot-extract-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const { host, path, document, script } of skills) {
    const digest = createHash('sha256').update(script).digest('hex');
    assert.equal(
      document.match(/Its SHA-256 .*? must be `([0-9a-f]{64})`/)?.[1],
      digest,
      `${host}: pinned SHA-256`,
    );
    const command = document
      .split('\n')
      .find((line) => line.startsWith("sed -n '/^<!-- agent-snapshot:start"));
    assert.ok(command, `${host}: extraction command`);
    const task = join(root, host);
    mkdirSync(task);
    const shell = command.replace(' SKILL ', () => ' "$1" ').replace(' TASK/', () => ' "$2"/');
    success(execute('bash', ['-c', shell, 'extract', path, task], root));
    assert.equal(
      readFileSync(join(task, 'agent-snapshot.sh'), 'utf8'),
      script,
      `${host}: extracted bytes`,
    );
  }
});

// Host-specific lines: title, coordinator model, Discover agent type, ladder rows, rung 2 note,
// dispatch API paragraph, and the model in the progress example. Everything else must match.
function sharedText(document) {
  return document
    .split('\n')
    .filter(
      (line) =>
        !/^(# Escalating subagents for |\| (Rung|-+|[1-5]) |Rung 2 is a fresh |Pass `model`|Use the exposed Codex schema)/.test(
          line,
        ),
    )
    .map((line) =>
      line
        .replace(/^Recommended coordinator: .*?\. Keep /, 'Recommended coordinator: HOST. Keep ')
        .replace(/^(2\. \*\*Discover - C\/D:\*\*.*?open questions\.).*/, '$1')
        .replace(/ · rung 3 \([^)]*\) · /, ' · rung 3 (MODEL) · '),
    )
    .join('\n');
}

it('keeps both skills identical outside host-specific lines', () => {
  assert.equal(sharedText(skills[0].document), sharedText(skills[1].document));
});

function execute(command, args, cwd, env = {}) {
  return spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: 15_000,
  });
}

function success(result) {
  assert.equal(result.error, undefined, String(result.error));
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function fileDigests(directory) {
  const digests = {};
  function walk(path, prefix = '') {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const relative = `${prefix}${entry.name}`;
      if (entry.isDirectory()) walk(join(path, entry.name), `${relative}/`);
      else if (entry.isFile()) {
        digests[relative] = createHash('sha256')
          .update(readFileSync(join(path, entry.name)))
          .digest('hex');
      }
    }
  }
  walk(directory);
  return digests;
}

function fixture(t, script) {
  const root = mkdtempSync(join(tmpdir(), 'agent-snapshot-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = join(root, 'repository with spaces');
  const taskRoot = join(root, 'escalating-subagents');
  mkdirSync(taskRoot, { mode: 0o700 });
  const task = mkdtempSync(join(taskRoot, 'task.'));
  const helper = join(task, 'agent-snapshot.sh');
  writeFileSync(helper, script, { mode: 0o600 });
  success(execute('bash', ['-n', helper], root));
  const state = join(task, 'state');
  mkdirSync(repo);
  const git = (...args) => success(execute('git', args, repo));
  const write = (name, value) => writeFileSync(join(repo, name), value);
  const run = (...args) => execute('bash', [helper, ...args], root);
  git('init', '-q');
  write('.gitignore', 'ignored.txt\ntracked-ignored.txt\n');
  write('tracked.txt', 'original\n');
  write('deleted.txt', 'to be removed\n');
  write('tracked-ignored.txt', 'tracked despite ignore\n');
  git('add', '.');
  git('add', '-f', 'tracked-ignored.txt');
  const init = () => success(run('init', repo, state));
  const capture = (name) => success(run('capture', state, name));
  const names = (from, to, location = state) => {
    const result = run('diff', location, from, to, 'names0');
    success(result);
    return result.stdout.split('\0').filter(Boolean).sort();
  };
  return { root, repo, state, helper, git, write, run, init, capture, names };
}

for (const { host, script } of skills) {
  describe(`${host} embedded agent-snapshot helper`, () => {
    it('survives fresh processes and cwd changes, preserving actual working content and Git storage', (t) => {
      const f = fixture(t, script);
      f.write('tracked.txt', 'staged before task\n');
      f.git('add', 'tracked.txt');
      f.write('tracked.txt', 'unstaged before task\n');
      f.write('user-untracked.txt', 'existing user work\n');
      f.write('ignored.txt', 'excluded\n');
      const gitBefore = fileDigests(join(f.repo, '.git'));
      f.init();
      f.capture('base');
      // An idempotent init cannot replace the task's snapshots.
      f.init();
      f.write('tracked.txt', 'implemented\n');
      f.write('tracked-ignored.txt', 'changed tracked ignored file\n');
      f.write('new file ü.txt', 'new\n');
      f.write('line\nbreak.txt', 'NUL-delimited path\n');
      rmSync(join(f.repo, 'deleted.txt'));
      success(execute('bash', [f.helper, 'capture', f.state, 'post-1'], tmpdir()));
      assert.deepEqual(f.names('base', 'post-1'), [
        'deleted.txt',
        'line\nbreak.txt',
        'new file ü.txt',
        'tracked-ignored.txt',
        'tracked.txt',
      ]);
      const patch = success(f.run('diff', f.state, 'base', 'post-1', 'patch'));
      assert.match(patch, /-unstaged before task/);
      assert.match(patch, /-tracked despite ignore/);
      assert.doesNotMatch(patch, /user-untracked|excluded/);
      assert.match(success(f.run('diff', f.state, 'base', 'post-1', 'stat')), /5 files changed/);
      assert.equal(
        readFileSync(join(f.repo, 'user-untracked.txt'), 'utf8'),
        'existing user work\n',
      );
      assert.deepEqual(fileDigests(join(f.repo, '.git')), gitBefore);
    });

    it('separates sequential handoffs and exposes the union of a parallel batch', (t) => {
      const f = fixture(t, script);
      f.init();
      f.capture('base');
      f.write('repro.test.ts', 'discovery evidence\n');
      f.capture('pre-implement');
      f.write('tracked.txt', 'implemented\n');
      f.capture('post-implement');
      assert.deepEqual(f.names('pre-implement', 'post-implement'), ['tracked.txt']);
      assert.deepEqual(f.names('base', 'post-implement'), ['repro.test.ts', 'tracked.txt']);
      f.capture('pre-batch');
      f.write('first.ts', 'worker 1\n');
      f.write('second.ts', 'worker 2\n');
      f.capture('post-batch');
      assert.deepEqual(f.names('pre-batch', 'post-batch'), ['first.ts', 'second.ts']);
    });

    it('reads a split index without changing it or losing tracked ignored files', (t) => {
      const f = fixture(t, script);
      f.git('update-index', '--split-index');
      assert.ok(readdirSync(join(f.repo, '.git')).some((name) => name.startsWith('sharedindex.')));
      const before = fileDigests(join(f.repo, '.git'));
      f.init();
      f.capture('base');
      f.write('tracked-ignored.txt', 'changed\n');
      f.capture('post');
      assert.deepEqual(f.names('base', 'post'), ['tracked-ignored.txt']);
      assert.deepEqual(fileDigests(join(f.repo, '.git')), before);
    });

    it('keeps task object stores independent and rejects cross-repository reuse', (t) => {
      const f = fixture(t, script);
      f.init();
      f.capture('base');
      const second = join(f.root, 'second state');
      success(f.run('init', f.repo, second));
      f.write('task-one.txt', 'first task\n');
      f.capture('post');
      success(f.run('capture', second, 'base'));
      f.write('task-two.txt', 'second task\n');
      success(f.run('capture', second, 'post'));
      assert.deepEqual(f.names('base', 'post'), ['task-one.txt']);
      assert.deepEqual(f.names('base', 'post', second), ['task-two.txt']);
      const otherRepo = join(f.root, 'other-repo');
      mkdirSync(otherRepo);
      success(execute('git', ['init', '-q'], otherRepo));
      const before = fileDigests(f.state);
      const failure = f.run('init', otherRepo, f.state);
      assert.notEqual(failure.status, 0);
      assert.match(failure.stderr, /different repository/);
      assert.deepEqual(fileDigests(f.state), before);
    });

    it('rejects missing or corrupt state, invalid names, duplicates, and state inside the repo', (t) => {
      const f = fixture(t, script);
      assert.match(f.run('capture', f.state, 'base').stderr, /run init first/);
      const internal = join(f.repo, 'state');
      assert.match(f.run('init', f.repo, internal).stderr, /outside the repository/);
      assert.equal(existsSync(internal), false);
      f.init();
      const base = f.capture('base');
      for (const name of ['../escape', '', 'two words', '-option']) {
        assert.notEqual(f.run('capture', f.state, name).status, 0);
      }
      assert.match(f.run('capture', f.state, 'base').stderr, /already exists/);
      assert.equal(readFileSync(join(f.state, 'trees/base.tree'), 'utf8').trim(), base);
      assert.match(f.run('diff', f.state, 'base', 'missing', 'patch').stderr, /missing snapshot/);
      writeFileSync(join(f.state, 'trees/broken.tree'), 'not-a-tree\n');
      assert.match(f.run('diff', f.state, 'base', 'broken', 'patch').stderr, /corrupt tree ID/);
      writeFileSync(join(f.state, 'trees/absent.tree'), `${'0'.repeat(40)}\n`);
      assert.notEqual(f.run('diff', f.state, 'base', 'absent', 'patch').status, 0);
      assert.match(f.run('diff', f.state, 'base', 'base', 'unknown').stderr, /diff mode/);
      const metadata = readFileSync(join(f.state, 'meta'));
      writeFileSync(join(f.state, 'meta'), 'invalid metadata\n');
      assert.notEqual(f.run('capture', f.state, 'post').status, 0);
      writeFileSync(join(f.state, 'meta'), metadata);
      success(
        execute(
          'git',
          ['config', '--file', join(f.state, 'meta'), 'snapshot.gitdir', '/wrong'],
          f.root,
        ),
      );
      assert.match(f.run('capture', f.state, 'post').stderr, /identity mismatch/);
      assert.equal(existsSync(join(f.state, 'trees/post.tree')), false);
    });

    it('does not source metadata as executable shell', (t) => {
      const f = fixture(t, script);
      f.init();
      const sentinel = join(f.root, 'must-not-exist');
      success(
        execute(
          'git',
          ['config', '--file', join(f.state, 'meta'), 'snapshot.repo', `$(touch '${sentinel}')`],
          f.root,
        ),
      );
      assert.notEqual(f.run('capture', f.state, 'base').status, 0);
      assert.equal(existsSync(sentinel), false);
    });

    it('rejects locked writes without disturbing the owner or valid snapshots', (t) => {
      const f = fixture(t, script);
      f.init();
      f.capture('base');
      mkdirSync(join(f.state, '.lock'));
      writeFileSync(join(f.state, '.lock/owner'), 'other writer\n');
      const before = fileDigests(f.state);
      assert.match(f.run('capture', f.state, 'post').stderr, /locked/);
      assert.deepEqual(fileDigests(f.state), before);
      assert.equal(success(f.run('diff', f.state, 'base', 'base', 'patch')), '');
    });

    it('does not publish a failed capture or replace a previous snapshot', (t) => {
      const f = fixture(t, script);
      f.init();
      f.capture('base');
      const tree = readFileSync(join(f.state, 'trees/base.tree'));
      f.git('config', 'filter.fail.clean', 'false');
      f.git('config', 'filter.fail.required', 'true');
      f.write('.gitattributes', 'filtered.txt filter=fail\n');
      f.write('filtered.txt', 'cannot clean\n');
      const before = fileDigests(join(f.repo, '.git'));
      assert.notEqual(f.run('capture', f.state, 'post').status, 0);
      assert.equal(existsSync(join(f.state, 'trees/post.tree')), false);
      assert.deepEqual(readFileSync(join(f.state, 'trees/base.tree')), tree);
      assert.equal(existsSync(join(f.state, '.lock')), false);
      assert.equal(
        readdirSync(f.state).some((name) => name.startsWith('write.')),
        false,
      );
      assert.deepEqual(fileDigests(join(f.repo, '.git')), before);
    });

    it(
      'cleans up a terminated capture while leaving published snapshots usable',
      { timeout: 15_000 },
      async (t) => {
        const f = fixture(t, script);
        f.init();
        f.capture('base');
        const tree = readFileSync(join(f.state, 'trees/base.tree'));
        const marker = join(f.root, 'filter-started');
        const quotedMarker = `'${marker.replaceAll("'", "'\\''")}'`;
        f.git('config', 'filter.pause.clean', `touch ${quotedMarker}; sleep 30; cat`);
        f.git('config', 'filter.pause.required', 'true');
        f.write('.gitattributes', 'filtered.txt filter=pause\n');
        f.write('filtered.txt', 'pause capture\n');
        const before = fileDigests(join(f.repo, '.git'));
        const child = spawn('bash', [f.helper, 'capture', f.state, 'post'], {
          cwd: f.root,
          detached: true,
          stdio: 'ignore',
        });
        const closed = new Promise((resolve, reject) => {
          child.once('error', reject);
          child.once('close', (code, signal) => resolve({ code, signal }));
        });
        t.after(() => {
          try {
            process.kill(-child.pid, 'SIGKILL');
          } catch {
            /* Already stopped. */
          }
        });
        for (let attempt = 0; attempt < 200 && !existsSync(marker); attempt++) await delay(20);
        assert.ok(existsSync(marker), 'capture must reach the blocking filter');
        assert.match(f.run('capture', f.state, 'concurrent').stderr, /locked/);
        process.kill(-child.pid, 'SIGTERM');
        const result = await closed;
        assert.notEqual(result.code, 0);
        assert.equal(existsSync(join(f.state, 'trees/post.tree')), false);
        assert.equal(existsSync(join(f.state, '.lock')), false);
        assert.deepEqual(readFileSync(join(f.state, 'trees/base.tree')), tree);
        assert.deepEqual(fileDigests(join(f.repo, '.git')), before);
        assert.equal(success(f.run('diff', f.state, 'base', 'base', 'patch')), '');
      },
    );
  });
}
