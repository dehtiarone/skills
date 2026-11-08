// Shared assertions for skills that ship one variant per host (claude/, codex/).
// Lives outside test/ because `node --test` also runs every .mjs under a test/ directory.
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
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

export const hosts = ['claude', 'codex'];
export const repoRoot = fileURLToPath(new URL('..', import.meta.url));

export function skillPath(host, skill) {
  return join(repoRoot, host, 'skills', skill, 'SKILL.md');
}

/** Load both host variants of a skill together with their embedded snapshot script. */
export function loadPair(skill) {
  return hosts.map((host) => {
    const path = skillPath(host, skill);
    const document = readFileSync(path, 'utf8');
    const blocks = [
      ...document.matchAll(
        /<!-- agent-snapshot:start -->\s*```bash\n([\s\S]*?)```\s*<!-- agent-snapshot:end -->/g,
      ),
    ];
    assert.equal(blocks.length, 1, `${host}/${skill}: exactly one embedded snapshot script`);
    return { host, skill, path, document, script: blocks[0][1] };
  });
}

export function assertIdenticalScripts(skills) {
  for (const entry of skills.slice(1)) {
    assert.equal(entry.script, skills[0].script, `${entry.host}/${entry.skill}: script differs`);
  }
}

export function assertPinnedHashAndExtraction(skills, t) {
  const root = mkdtempSync(join(tmpdir(), 'agent-snapshot-extract-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const { host, skill, path, document, script } of skills) {
    const digest = createHash('sha256').update(script).digest('hex');
    assert.equal(
      document.match(/Its SHA-256 .*? must be `([0-9a-f]{64})`/)?.[1],
      digest,
      `${host}/${skill}: pinned SHA-256`,
    );
    const command = document
      .split('\n')
      .find((line) => line.startsWith("sed -n '/^<!-- agent-snapshot:start"));
    assert.ok(command, `${host}/${skill}: extraction command`);
    const task = join(root, `${host}-${skill}`);
    mkdirSync(task);
    const shell = command.replace(' SKILL ', () => ' "$1" ').replace(' TASK/', () => ' "$2"/');
    success(execute('bash', ['-c', shell, 'extract', path, task], root));
    assert.equal(
      readFileSync(join(task, 'agent-snapshot.sh'), 'utf8'),
      script,
      `${host}/${skill}: extracted bytes`,
    );
  }
}

/**
 * Reduce a document to its host-neutral text. `dropLine` matches whole lines that are
 * host-specific; `normalize` is a list of [pattern, replacement] applied to every line.
 */
export function sharedText(document, { dropLine, normalize = [] }) {
  return document
    .split('\n')
    .filter((line) => !dropLine.test(line))
    .map((line) => normalize.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), line))
    .join('\n');
}

export function assertSharedText(skills, rules) {
  const [first, ...rest] = skills;
  for (const entry of rest) {
    assert.equal(
      sharedText(entry.document, rules),
      sharedText(first.document, rules),
      `${entry.host}/${entry.skill}: differs from ${first.host} outside host-specific lines`,
    );
  }
}

/** Register the three pair tests every two-host skill needs. */
export function pairSuite(skills, rules) {
  it('embeds identical standalone scripts in both skills', () => {
    assertIdenticalScripts(skills);
  });

  it('pins the script hash and extracts it byte-exactly with the documented command', (t) => {
    assertPinnedHashAndExtraction(skills, t);
  });

  it('keeps both skills identical outside host-specific lines', () => {
    assertSharedText(skills, rules);
  });
}

export function execute(command, args, cwd, env = {}) {
  return spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: 15_000,
  });
}

export function success(result) {
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

function fixture(t, script, taskRootName) {
  const root = mkdtempSync(join(tmpdir(), 'agent-snapshot-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = join(root, 'repository with spaces');
  const taskRoot = join(root, taskRootName);
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

/** Behavioural tests of the embedded helper, once per host variant. */
export function describeHelperSuite(skills) {
  for (const { host, skill, script } of skills) {
    describe(`${host} embedded agent-snapshot helper`, () => {
      const make = (t) => fixture(t, script, skill);

      it('survives fresh processes and cwd changes, preserving actual working content and Git storage', (t) => {
        const f = make(t);
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
        const f = make(t);
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
        const f = make(t);
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
        const f = make(t);
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
        const f = make(t);
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
        const f = make(t);
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
        const f = make(t);
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
        const f = make(t);
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
          const f = make(t);
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
}

/**
 * Strict subset of YAML covering this repo's frontmatter and eval files: block mappings, nested
 * mappings, double-quoted (JSON-compatible) and single-quoted scalars, JSON flow values, and plain
 * scalars. A plain scalar that would not parse as YAML (": " or " #" inside, a reserved first
 * character) is rejected instead of guessed at, because Claude Code parses the block with a real
 * YAML parser and silently drops every field when it fails.
 */
export function parseYamlSubset(text) {
  const lines = text.split('\n');
  const indentOf = (line) => line.length - line.trimStart().length;
  const blank = (line) => line.trim() === '' || line.trimStart().startsWith('#');
  let index = 0;

  function scalar(value, line) {
    if (value.startsWith('"')) {
      if (!/^"(?:[^"\\]|\\.)*"$/.test(value)) throw new Error(`line ${line}: unterminated double-quoted scalar`);
      return JSON.parse(value);
    }
    if (value.startsWith("'")) {
      if (!/^'(?:[^']|'')*'$/.test(value)) throw new Error(`line ${line}: unterminated single-quoted scalar`);
      return value.slice(1, -1).replaceAll("''", "'");
    }
    if (value.startsWith('{') || value.startsWith('[')) return JSON.parse(value);
    if (/^[>|]/.test(value)) throw new Error(`line ${line}: block scalars are not used in this repo`);
    if (/^[&*!%@`]/.test(value) || value.includes(': ') || value.endsWith(':') || value.includes(' #')) {
      throw new Error(`line ${line}: plain scalar ${JSON.stringify(value)} is not valid YAML; quote it`);
    }
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === 'null' || value === '~') return null;
    if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
    return value;
  }

  function block(indent) {
    const out = {};
    while (index < lines.length) {
      const line = lines[index];
      if (blank(line)) {
        index++;
        continue;
      }
      const current = indentOf(line);
      if (current < indent) break;
      if (current > indent) throw new Error(`line ${index + 1}: unexpected indentation`);
      const match = line.slice(indent).match(/^([A-Za-z0-9_-]+):(?:[ \t]+(.*))?$/);
      if (!match) throw new Error(`line ${index + 1}: expected "key: value", got ${JSON.stringify(line)}`);
      const [, key, rest] = match;
      if (key in out) throw new Error(`line ${index + 1}: duplicate key ${key}`);
      index++;
      if (rest === undefined || rest.trim() === '') {
        const next = lines.slice(index).find((candidate) => !blank(candidate));
        if (!next || indentOf(next) <= indent) throw new Error(`line ${index}: "${key}" has no value`);
        out[key] = block(indentOf(next));
      } else {
        out[key] = scalar(rest.trim(), index);
      }
    }
    return out;
  }

  return block(0);
}

/** Split a Markdown document into its parsed frontmatter and body. */
export function parseFrontmatter(document) {
  const match = document.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) throw new Error('missing frontmatter block');
  return { frontmatter: parseYamlSubset(match[1]), raw: match[1], body: document.slice(match[0].length) };
}

/** Frontmatter and invocation-policy tests every two-host skill needs. */
export function frontmatterSuite(skills) {
  it('has frontmatter that parses as YAML with the required fields within agentskills limits', () => {
    for (const { host, skill, document } of skills) {
      const { frontmatter } = parseFrontmatter(document);
      assert.equal(frontmatter.name, skill, `${host}/${skill}: name`);
      for (const key of ['description', 'license', 'compatibility', 'metadata']) {
        assert.ok(frontmatter[key], `${host}/${skill}: ${key}`);
      }
      assert.ok(frontmatter.description.length <= 1024, `${host}/${skill}: description ≤ 1024 chars`);
      assert.ok(frontmatter.compatibility.length <= 500, `${host}/${skill}: compatibility ≤ 500 chars`);
      assert.match(frontmatter.metadata.version, /^\d+\.\d+\.\d+$/, `${host}/${skill}: metadata.version`);
    }
  });

  it('is explicit-only on every host', () => {
    for (const { host, skill, path, document } of skills) {
      const { frontmatter } = parseFrontmatter(document);
      assert.match(frontmatter.description, /never applied automatically/, `${host}/${skill}: description says so`);
      if (host === 'claude') {
        assert.equal(frontmatter['disable-model-invocation'], true, `${host}/${skill}: disable-model-invocation`);
        assert.ok(frontmatter['argument-hint'], `${host}/${skill}: argument-hint`);
      } else {
        assert.equal(frontmatter['disable-model-invocation'], undefined, `${host}/${skill}: Claude-only key absent`);
        const policyPath = join(dirname(path), 'agents', 'openai.yaml');
        assert.ok(existsSync(policyPath), `${host}/${skill}: agents/openai.yaml`);
        const policy = parseYamlSubset(readFileSync(policyPath, 'utf8'));
        assert.equal(policy.policy?.allow_implicit_invocation, false, `${host}/${skill}: allow_implicit_invocation`);
        assert.ok(policy.interface?.display_name, `${host}/${skill}: interface.display_name`);
      }
    }
  });

  it('frontmatter also parses with the system Ruby YAML parser', (t) => {
    const probe = spawnSync('ruby', ['--version'], { encoding: 'utf8' });
    if (probe.error || probe.status !== 0) return t.skip('ruby not available');
    for (const { host, skill, document } of skills) {
      const { raw } = parseFrontmatter(document);
      const result = spawnSync(
        'ruby',
        ['-Eutf-8:utf-8', '-ryaml', '-rjson', '-e', 'puts JSON.generate(YAML.safe_load(STDIN.read))'],
        { input: raw, encoding: 'utf8', env: { ...process.env, LC_ALL: 'en_US.UTF-8' }, timeout: 15_000 },
      );
      assert.equal(result.status, 0, `${host}/${skill}: ${result.stderr}`);
      assert.deepEqual(JSON.parse(result.stdout), parseYamlSubset(raw), `${host}/${skill}: both parsers agree`);
    }
  });
}
