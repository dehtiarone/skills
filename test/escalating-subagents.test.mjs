import assert from 'node:assert/strict';
import { it } from 'node:test';
import { describeHelperSuite, frontmatterSuite, loadPair, pairSuite } from '../test-support/skill-pair.mjs';

const skills = loadPair('escalating-subagents');

// Host-specific lines: Claude-only frontmatter, title, coordinator model, Discover agent type, ladder
// rows, rung 2 note, dispatch API paragraph, and the model in the progress example. Everything else must match.
pairSuite(skills, {
  dropLine:
    /^(disable-model-invocation: |argument-hint: |# Escalating subagents for |\| (Rung|-+|[1-5]) |Rung 2 is a fresh |Pass `model`|Use the exposed Codex schema)/,
  normalize: [
    [/^Recommended coordinator: .*?\. Keep /, 'Recommended coordinator: HOST. Keep '],
    [/^(2\. \*\*Discover - C\/D:\*\*.*?open questions\.).*/, '$1'],
    [/ · rung 3 \([^)]*\) · /, ' · rung 3 (MODEL) · '],
  ],
});

frontmatterSuite(skills);

it('states the identical invocation rule in both variants and names its sibling', () => {
  const sentence =
    /^Invocation: this skill runs only when the user invokes it by name; it is never applied automatically\.[^\n]*`cheap-parallel-agents`[^\n]*before dispatching\.$/m;
  const found = skills.map(({ document }) => document.match(sentence)?.[0]);
  assert.ok(found[0], 'claude: invocation paragraph');
  assert.equal(found[1], found[0], 'codex: identical invocation paragraph');
});

it('runs stages in parallel where the work allows, waits for whole validation cycles, and reports concurrency', () => {
  for (const { host, document } of skills) {
    assert.match(document, /Up to 3 read-only shards may run as one batch when their questions or paths are disjoint/, `${host}: Discover shards`);
    assert.match(
      document,
      /^Implement runs in parallel by default\. An item joins a batch only when all three hold: disjoint ownership/m,
      `${host}: Implement eligibility`,
    );
    assert.match(document, /dispatched together and awaited together; no repair starts until every validator of the cycle has returned/, `${host}: validator barrier`);
    assert.match(document, /`remaining ≥ workers in this batch \+ Implement items outside this batch not yet dispatched \+ the final Validate set when required`/, `${host}: admission`);
    assert.match(document, /^Parallelism: \[batches \| observed max concurrent \| measured elapsed per batch\]$/m, `${host}: report field`);
    assert.match(document, /as literal absolute paths, never through shell variables/, `${host}: literal helper paths`);
    assert.match(document, /tier B with three implementers, 3 \+ 0 \+ 1 = 4 of 4/, `${host}: admission example`);
    assert.match(document, /capture `post-N` and check its scope before dispatching the next batch or validating/, `${host}: per-batch scope check`);
  }
});

describeHelperSuite(skills);
