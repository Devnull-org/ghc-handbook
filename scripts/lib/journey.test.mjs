import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEDGER, resolveDefinition, resolveLedger } from './journey.mjs';

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

test('resolveDefinition finds a column-0 signature, skipping comments and call sites', () => {
  assert.equal(resolveDefinition(FIXTURE, 'tcExpr ::'), 5);
});

test('resolveDefinition supports bare-name patterns for multi-line signatures', () => {
  assert.equal(resolveDefinition(FIXTURE, 'matchWrapper'), 7);
});

test('resolveDefinition returns null when nothing matches', () => {
  assert.equal(resolveDefinition(FIXTURE, 'dsExpr ::'), null);
});

test('resolveLedger reports every miss and resolves the rest', () => {
  const ledger = [
    {
      id: 'x',
      title: 'X',
      stage: null,
      chapter: 'parser',
      functions: [
        { name: 'tcExpr', file: 'A.hs', pattern: 'tcExpr ::', role: '' },
        { name: 'gone', file: 'A.hs', pattern: 'gone ::', role: '' },
        { name: 'noFile', file: 'B.hs', pattern: 'x ::', role: '' },
      ],
    },
  ];
  const { phases, unresolved } = resolveLedger(ledger, (f) => (f === 'A.hs' ? FIXTURE : null));
  assert.equal(phases[0].functions[0].line, 5);
  assert.equal(phases[0].functions[1].line, null);
  assert.equal(unresolved.length, 2);
  assert.match(unresolved[0], /gone/);
  assert.match(unresolved[1], /noFile|B\.hs/);
});

test('the shipped ledger is well-formed', () => {
  assert.ok(LEDGER.length >= 6);
  for (const phase of LEDGER) {
    assert.ok(phase.id && phase.title && phase.chapter, `phase ${phase.id} incomplete`);
    assert.ok(phase.functions.length >= 3, `phase ${phase.id} too thin`);
    for (const fn of phase.functions) {
      assert.ok(fn.name && fn.file && fn.pattern && fn.role, `${phase.id}/${fn.name} incomplete`);
      assert.ok(fn.file.startsWith('compiler/'), `${fn.name} outside compiler/`);
    }
  }
});
