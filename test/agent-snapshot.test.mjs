// Behaviour of scripts/agent-snapshot.sh. The script is byte-identical on both hosts (checked in
// escalating-agents.test.mjs), so the suite runs against one copy.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { describeHelperSuite, execute, loadPair, skillDir, success } from '../test-support/skill-pair.mjs';

describeHelperSuite([loadPair()[0]]);

const helper = join(skillDir('claude'), 'scripts', 'agent-snapshot.sh');

function scratch(t, { git }) {
  const root = mkdtempSync(join(tmpdir(), 'agent-snapshot-new-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const work = join(root, 'work dir');
  const state = join(root, 'state');
  mkdirSync(join(work, 'src'), { recursive: true });
  writeFileSync(join(work, 'src/a.txt'), 'a\n');
  writeFileSync(join(work, 'notes.txt'), 'notes\n');
  if (git) {
    success(execute('git', ['init', '-q'], work));
    success(execute('git', ['add', '-A'], work));
  }
  const run = (...args) => execute('bash', [helper, ...args], root);
  return { root, work, state, run, write: (name, value) => writeFileSync(join(work, name), value) };
}

describe('agent-snapshot checkpoint', () => {
  it('captures, scope-checks against owned globs and writes the integrated patch in one call', (t) => {
    const f = scratch(t, { git: true });
    success(f.run('init', f.work, f.state));
    success(f.run('capture', f.state, 'base'));
    success(f.run('capture', f.state, 'pre-1'));
    f.write('src/a.txt', 'changed\n');
    f.write('src/new file.txt', 'new\n');
    const patch = join(f.root, 'post-1.patch');
    const ok = f.run('checkpoint', f.state, 'pre-1', 'post-1', patch, 'src/*');
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /^checkpoint post-1 tree=[0-9a-f]{40,64} changed=2 out-of-scope=0 patch=.*post-1\.patch\n$/);
    assert.match(readFileSync(patch, 'utf8'), /\+changed/);
    assert.ok(existsSync(join(f.state, 'trees/post-1.tree')));
    assert.equal(existsSync(join(f.state, '.lock')), false);
    // A directory owns everything under it; an existing snapshot is reused, not recaptured.
    assert.equal(f.run('checkpoint', f.state, 'pre-1', 'post-1', '-', 'src').status, 0);
    assert.equal(f.run('checkpoint', f.state, 'pre-1', 'post-1', '-', 'src/').status, 0);
  });

  it('exits 3 and names every path outside the owned globs, including for a read-only batch', (t) => {
    const f = scratch(t, { git: true });
    success(f.run('init', f.work, f.state));
    success(f.run('capture', f.state, 'pre-1'));
    f.write('src/a.txt', 'changed\n');
    f.write('notes.txt', 'stray\n');
    f.write('line\nbreak.txt', 'odd name\n');
    const mixed = f.run('checkpoint', f.state, 'pre-1', 'post-1', '-', 'src/a.txt');
    assert.equal(mixed.status, 3);
    assert.match(mixed.stdout, /changed=3 out-of-scope=2/);
    assert.match(mixed.stdout, /^out-of-scope: notes\.txt$/m);
    assert.match(mixed.stdout, /^out-of-scope: line\?break\.txt$/m);
    const readOnly = f.run('checkpoint', f.state, 'pre-1', 'post-1', '-');
    assert.equal(readOnly.status, 3);
    assert.match(readOnly.stdout, /out-of-scope=3/);
    assert.notEqual(f.run('checkpoint', f.state, 'missing', 'post-2', '-').status, 0);
    assert.equal(f.run('checkpoint', f.state, 'pre-1').status, 64);
  });
});

describe('agent-snapshot in a plain directory', () => {
  it('snapshots a directory that is not a git repository without creating one inside it', (t) => {
    const f = scratch(t, { git: false });
    assert.match(f.run('init', f.work, f.state).stderr, /use init --plain for a plain directory/);
    success(f.run('init', '--plain', f.work, f.state));
    const base = success(f.run('capture', f.state, 'base'));
    assert.match(base, /^[0-9a-f]{40,64}$/);
    f.write('src/a.txt', 'changed\n');
    f.write('out.csv', 'x,y\n1,2\n');
    rmSync(join(f.work, 'notes.txt'));
    success(f.run('capture', f.state, 'post-1'));
    const names = f.run('diff', f.state, 'base', 'post-1', 'names0').stdout.split('\0').filter(Boolean).sort();
    assert.deepEqual(names, ['notes.txt', 'out.csv', 'src/a.txt']);
    assert.match(success(f.run('diff', f.state, 'base', 'post-1', 'patch')), /\+1,2/);
    assert.equal(existsSync(join(f.work, '.git')), false);
    assert.match(f.run('capture', f.state, 'base').stderr, /already exists/);
    const scoped = f.run('checkpoint', f.state, 'base', 'post-1', '-', 'out.csv', 'src/');
    assert.equal(scoped.status, 3);
    assert.match(scoped.stdout, /^out-of-scope: notes\.txt$/m);
  });

  it('keeps state outside the directory and refuses to reuse it for another directory or mode', (t) => {
    const f = scratch(t, { git: false });
    assert.match(f.run('init', '--plain', f.work, join(f.work, 'state')).stderr, /outside the repository/);
    success(f.run('init', '--plain', f.work, f.state));
    success(f.run('init', '--plain', f.work, f.state));
    const other = join(f.root, 'other');
    mkdirSync(other);
    assert.match(f.run('init', '--plain', other, f.state).stderr, /different repository/);
    success(execute('git', ['init', '-q'], other));
    assert.match(f.run('init', other, f.state).stderr, /different repository/);
    rmSync(f.work, { recursive: true });
    assert.match(f.run('capture', f.state, 'late').stderr, /identity mismatch/);
  });
});
