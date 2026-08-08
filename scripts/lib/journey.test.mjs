import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LEDGER,
  extractSignature,
  flattenPaths,
  functionBody,
  mentions,
  resolveDefinition,
  resolveLedger,
} from './journey.mjs';

const FIXTURE = [
  'module Fake where',
  '',
  '-- tcExpr :: mentioned in a comment, indented call below',
  '  tcExpr (HsVar x)',
  'tcExpr :: HsExpr GhcRn -> TcM Thing',
  'tcExpr e = go e',
  'matchWrapper',
  '  :: HsMatchContext',
].join('\n');

// The shape GHC actually has: helpers and comment prose interleaved between a
// function's signature and its equations.
const INTERLEAVED = [
  'rnExpr :: HsExpr GhcPs -> RnM Thing',
  '',
  'rnUnboundVar :: RdrName -> RnM Thing',
  'rnUnboundVar v = reportUnbound v',
  '',
  'rnExpr (HsVar v)',
  '  = lookupExprOccRn v',
  'Some column-zero prose inside a block comment.',
  'rnExpr (HsLam m)',
  '  = rnMatchGroup m',
].join('\n');

test('resolveDefinition finds a column-0 signature, skipping comments and call sites', () => {
  assert.equal(resolveDefinition(FIXTURE, 'tcExpr ::'), 5);
});

test('resolveDefinition supports bare-name patterns for multi-line signatures', () => {
  assert.equal(resolveDefinition(FIXTURE, 'matchWrapper'), 7);
});

test('resolveDefinition returns null when nothing matches', () => {
  assert.equal(resolveDefinition(FIXTURE, 'dsExpr ::'), null);
});

test('extractSignature takes the definition line plus indented continuations', () => {
  assert.equal(extractSignature(FIXTURE, 5), 'tcExpr :: HsExpr GhcRn -> TcM Thing');
  assert.equal(extractSignature(FIXTURE, 7), 'matchWrapper\n  :: HsMatchContext');
});

test('extractSignature caps runaway continuations', () => {
  const long = 'f\n' + '  x\n'.repeat(50);
  assert.equal(extractSignature(long, 1, 4).split('\n').length, 4);
});

test('functionBody collects every equation, skipping interleaved helpers', () => {
  const b = functionBody(INTERLEAVED, 'rnExpr');
  assert.match(b, /lookupExprOccRn/);
  assert.match(b, /rnMatchGroup/);
  assert.doesNotMatch(b, /reportUnbound/);
});

test('mentions treats primed and qualified names correctly', () => {
  assert.ok(mentions("runHsc hsc_env $ hscParse' mod_summary", "hscParse'"));
  assert.ok(mentions('StgToCmm.codeGen logger tmpfs', 'codeGen'));
  assert.ok(!mentions('tcExprSig x', 'tcExpr'));
  assert.ok(!mentions("tcExpr' x", 'tcExpr'));
});

test('resolveLedger verifies edges and reports both kinds of failure', () => {
  const ledger = [
    {
      id: 'x',
      title: 'X',
      stage: null,
      chapter: 'parser',
      repr: { type: 'T', note: 'n' },
      keyFn: 'rnExpr',
      paths: [
        {
          name: 'rnExpr',
          file: 'A.hs',
          pattern: 'rnExpr ::',
          role: '',
          children: [
            { name: 'lookupExprOccRn', file: 'A.hs', pattern: 'nowhere ::', role: '', children: [] },
            { name: 'notCalled', file: 'A.hs', pattern: 'rnUnboundVar ::', role: '', children: [] },
          ],
        },
      ],
    },
  ];
  const { phases, unresolved, unverified } = resolveLedger(ledger, () => INTERLEAVED);
  assert.equal(phases[0].paths[0].line, 1);
  assert.equal(unresolved.length, 1, 'lookupExprOccRn pattern does not resolve');
  assert.equal(unverified.length, 1, 'notCalled is not mentioned in rnExpr');
  assert.match(unverified[0], /rnExpr -> notCalled/);
});

test('the shipped ledger is well-formed', () => {
  assert.ok(LEDGER.length >= 6);
  for (const phase of LEDGER) {
    assert.ok(phase.id && phase.title && phase.chapter, `phase ${phase.id} incomplete`);
    assert.ok(phase.repr?.type && phase.repr?.note, `phase ${phase.id} missing repr`);
    const flat = flattenPaths(phase.paths);
    assert.ok(
      flat.some((f) => f.name === phase.keyFn),
      `phase ${phase.id} keyFn "${phase.keyFn}" is not on its own path`,
    );
    assert.ok(flat.length >= 3, `phase ${phase.id} too thin`);
    for (const fn of flat) {
      assert.ok(fn.name && fn.file && fn.pattern && fn.role, `${phase.id}/${fn.name} incomplete`);
      assert.ok(fn.file.startsWith('compiler/'), `${fn.name} outside compiler/`);
    }
  }
});
