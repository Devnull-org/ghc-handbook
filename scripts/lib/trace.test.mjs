import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTrace, nodeLines } from './trace.mjs';

test('opener with trailing brace nests until anonymous closer', () => {
  const tree = parseTrace(['solveWanteds {', '  work item: [W] Show a', 'addInertCan', '}'].join('\n'));
  assert.equal(tree.length, 1);
  assert.equal(tree[0].label, 'solveWanteds');
  assert.equal(tree[0].body, '  work item: [W] Show a');
  assert.deepEqual(
    tree[0].children.map((c) => c.label),
    ['addInertCan'],
  );
});

test('opener with mid-line payload keeps the payload as body', () => {
  const tree = parseTrace(['checkInitialKinds { []', 'checkInitialKinds done }'].join('\n'));
  assert.equal(tree[0].label, 'checkInitialKinds');
  assert.equal(tree[0].body, '[]');
  assert.equal(tree[0].end, 'checkInitialKinds done');
});

test('---- dressing is stripped from labels', () => {
  const tree = parseTrace(['---- tcTyClGroup ---- {', '---- end tcTyClGroup ---- }'].join('\n'));
  assert.equal(tree[0].label, 'tcTyClGroup');
});

test('named closer heals over an opener that never closes', () => {
  // tcInferTyApps opens and never closes, a real GHC habit. The named closer
  // for the outer region must pop through it instead of leaving the rest of
  // the trace nested underneath.
  const tree = parseTrace(
    ['pushLevelAndSolveEqualitiesX {', 'tcInferTyApps {', '  (Expr, [a])', 'pushLevelAndSolveEqualities }', 'after'].join(
      '\n',
    ),
  );
  assert.equal(tree.length, 2);
  assert.equal(tree[0].label, 'pushLevelAndSolveEqualitiesX');
  assert.equal(tree[0].children[0].label, 'tcInferTyApps');
  assert.equal(tree[1].label, 'after');
});

test('a printed coercion hole is not a closer', () => {
  // `Sym {co}` ends in `}` but the brace is not a standalone token.
  const tree = parseTrace(['solveWanteds {', 'Filling coercion hole co := Sym {co}', '}'].join('\n'));
  assert.equal(tree.length, 1);
  assert.equal(tree[0].children[0].label, 'Filling coercion hole co := Sym {co}');
});

test('a closer naming no open frame becomes an ordinary line', () => {
  const tree = parseTrace(['plain line', 'kcConDecl:GADT }'].join('\n'));
  assert.deepEqual(
    tree.map((n) => n.label),
    ['plain line', 'kcConDecl:GADT }'],
  );
});

test('indented lines attach to the most recent node, not the frame', () => {
  const tree = parseTrace(['u_tys', '  Int ~ Int', 'next'].join('\n'));
  assert.equal(tree[0].label, 'u_tys');
  assert.equal(tree[0].body, '  Int ~ Int');
  assert.equal(tree[1].label, 'next');
});

test('unclosed frames simply end at EOF', () => {
  const tree = parseTrace(['tcHsSigType {', 'inner'].join('\n'));
  assert.equal(tree.length, 1);
  assert.equal(tree[0].children[0].label, 'inner');
});

test('banner-sectioned output becomes flat sections', () => {
  const tree = parseTrace(
    ['==================== Simplifier iteration=1 ====================', 'total = \\ xs -> ...', '  more', ''].join('\n'),
  );
  assert.equal(tree.length, 1);
  assert.equal(tree[0].label, 'Simplifier iteration=1');
  assert.match(tree[0].body, /total = /);
  assert.equal(tree[0].children.length, 0);
});

test('nodeLines counts label, body and end across the subtree', () => {
  const tree = parseTrace(['a {', '  one', '  two', 'leaf', 'a done }'].join('\n'));
  // a(1) + body(2) + end(1) + leaf(1)
  assert.equal(nodeLines(tree[0]), 5);
});
