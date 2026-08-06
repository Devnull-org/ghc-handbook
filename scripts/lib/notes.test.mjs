import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSource, resolveNotes, moduleNameFromPath, noteId } from './notes.mjs';

// Fixtures mirror the real comment shapes found in the GHC tree. Each one was
// copied from a real file and trimmed, so a regression here means the parser has
// genuinely stopped understanding a shape GHC uses.

test('module name derivation', () => {
  assert.equal(moduleNameFromPath('compiler/GHC/Tc/Solver.hs'), 'GHC.Tc.Solver');
  assert.equal(moduleNameFromPath('compiler/GHC/Parser.y'), 'GHC.Parser');
  assert.equal(moduleNameFromPath('compiler/GHC/Parser/Lexer.x'), 'GHC.Parser.Lexer');
  assert.equal(moduleNameFromPath('compiler/GHC/Tc/Types.hs-boot'), 'GHC.Tc.Types');
  assert.equal(
    moduleNameFromPath('compiler/Language/Haskell/Syntax/Expr.hs'),
    'Language.Haskell.Syntax.Expr',
  );
  // Lowercase build-layout dirs are not module components.
  assert.equal(
    moduleNameFromPath('libraries/ghc-internal/src/GHC/Internal/Unsafe/Coerce.hs'),
    'GHC.Internal.Unsafe.Coerce',
  );
  // C sources are not modules.
  assert.equal(moduleNameFromPath('rts/Interpreter.c'), null);
});

test('parses a Haskell block-comment note', () => {
  const src = `
{-
Note [Prioritise equalities]
~~~~~~~~~~~~~~~~~~~~~~~~~~~~
It's very important to process equalities first.

As #14723 showed, we can loop otherwise.
-}
foo :: Int
`;
  const { definitions } = parseSource(src, 'compiler/GHC/Tc/Solver/InertSet.hs');
  assert.equal(definitions.length, 1);
  const [d] = definitions;
  assert.equal(d.title, 'Prioritise equalities');
  assert.equal(d.module, 'GHC.Tc.Solver.InertSet');
  assert.equal(d.id, 'GHC.Tc.Solver.InertSet.prioritise-equalities');
  assert.match(d.body, /^It's very important/);
  assert.match(d.body, /loop otherwise\.$/);
  assert.deepEqual(d.tickets, ['14723']);
  // The closing `-}` must not leak into the body.
  assert.doesNotMatch(d.body, /-\}/);
});

test('parses the `{- Note [X]` same-line opening form', () => {
  const src = `{- Note [Inline me]
~~~~~~~~~~~~~~~~~~
Body line.
-}
`;
  const { definitions } = parseSource(src, 'compiler/GHC/Core/Opt/Simplify.hs');
  assert.equal(definitions.length, 1);
  assert.equal(definitions[0].title, 'Inline me');
  assert.equal(definitions[0].body, 'Body line.');
});

test('parses the `--` line-comment form and stops at code', () => {
  const src = `
-- Note [Line comment note]
-- ~~~~~~~~~~~~~~~~~~~~~~~~
-- First line.
-- Second line.
realCode :: Int
realCode = 1
`;
  const { definitions } = parseSource(src, 'compiler/GHC/Utils/Misc.hs');
  assert.equal(definitions.length, 1);
  assert.equal(definitions[0].body, 'First line.\nSecond line.');
});

test('parses RTS C block comments with `*` continuation', () => {
  const src = `
/* Note [Adjustor pools]
 * ~~~~~~~~~~~~~~~~~~~~~
 * Memory management for adjustors is complicated.
 * See also Note [Adjustors].
 */
void foo(void) {}
`;
  const { definitions } = parseSource(src, 'rts/adjustor/AdjustorPool.c');
  assert.equal(definitions.length, 1);
  const [d] = definitions;
  assert.equal(d.title, 'Adjustor pools');
  assert.equal(d.module, null);
  assert.equal(d.body, 'Memory management for adjustors is complicated.\nSee also Note [Adjustors].');
  assert.doesNotMatch(d.body, /\*\//);
});

test('keeps `*` bullets in Haskell notes but strips `*` continuation in C notes', () => {
  // GHC's Haskell Notes lean heavily on `*` bullet lists; eating those marks
  // would silently reflow the argument structure of hundreds of Notes.
  const haskell = `
{-
Note [Prioritise equalities]
~~~~~~~~~~~~~~~~~~~~~~~~~~~~
It matters because:

* (Efficiency) Processing equalities first avoids kick-out.
* (Termination) Otherwise fundeps can loop.
-}
`;
  const { definitions } = parseSource(haskell, 'compiler/GHC/Tc/Solver/InertSet.hs');
  assert.match(definitions[0].body, /^\* \(Efficiency\)/m);
  assert.match(definitions[0].body, /^\* \(Termination\)/m);

  const c = `
/* Note [Adjustor pools]
 * ~~~~~~~~~~~~~~~~~~~~~
 * First line.
 * Second line.
 */
`;
  const { definitions: cDefs } = parseSource(c, 'rts/adjustor/AdjustorPool.c');
  assert.equal(cDefs[0].body, 'First line.\nSecond line.');
});

test('splits multiple notes sharing one comment block', () => {
  const src = `
{-
Note [First]
~~~~~~~~~~~~
Body one.

Note [Second]
~~~~~~~~~~~~~
Body two.
-}
`;
  const { definitions } = parseSource(src, 'compiler/GHC/Foo.hs');
  assert.deepEqual(definitions.map((d) => d.title), ['First', 'Second']);
  assert.equal(definitions[0].body, 'Body one.');
  assert.equal(definitions[1].body, 'Body two.');
});

test('requires the tilde underline to treat a line as a definition', () => {
  const src = `
{-
Note [Not a definition]
This has no underline, so it is only prose mentioning a Note.
-}
`;
  const { definitions } = parseSource(src, 'compiler/GHC/Foo.hs');
  assert.equal(definitions.length, 0);
});

test('collects references, including inside note bodies', () => {
  const src = `
{-
Note [Alpha]
~~~~~~~~~~~~
See Note [Beta] in GHC.Other.Module for details.
-}
foo = bar -- see Note [Gamma]
`;
  const { references } = parseSource(src, 'compiler/GHC/Foo.hs');
  const titles = references.map((r) => r.title);
  // The definition header itself is not a reference; the body mention is.
  assert.ok(!titles.includes('Alpha'));
  assert.ok(titles.includes('Beta'));
  assert.ok(titles.includes('Gamma'));
  assert.equal(references.find((r) => r.title === 'Beta').qualifier, 'GHC.Other.Module');
});

test('trailing sentence punctuation is not part of the qualifier', () => {
  const src = 'foo = bar -- see Note [How tuples work] in GHC.Builtin.Types.\n';
  const { references } = parseSource(src, 'compiler/GHC/Builtin/Names.hs');
  assert.equal(references[0].qualifier, 'GHC.Builtin.Types');
});

test('resolution prefers explicit qualifier, then same module, then uniqueness', () => {
  const defs = [
    { id: 'A.dup', title: 'Dup', module: 'A', file: 'A.hs', line: 1, body: '' },
    { id: 'B.dup', title: 'Dup', module: 'B', file: 'B.hs', line: 1, body: '' },
    { id: 'C.solo', title: 'Solo', module: 'C', file: 'C.hs', line: 1, body: '' },
  ];

  const { notes, ambiguous, unresolved } = resolveNotes(defs, [
    { title: 'Dup', qualifier: 'B', fromModule: 'Z', file: 'Z.hs', line: 5 },
    { title: 'Dup', qualifier: null, fromModule: 'A', file: 'A.hs', line: 40 },
    { title: 'Solo', qualifier: null, fromModule: 'Z', file: 'Z.hs', line: 7 },
    { title: 'Dup', qualifier: null, fromModule: 'Z', file: 'Z.hs', line: 9 },
    { title: 'Nonexistent', qualifier: null, fromModule: 'Z', file: 'Z.hs', line: 11 },
  ]);

  const byId = Object.fromEntries(notes.map((n) => [n.id, n]));
  assert.equal(byId['B.dup'].refsIn.length, 1, 'explicit qualifier wins');
  assert.equal(byId['A.dup'].refsIn.length, 1, 'same-module reference wins');
  assert.equal(byId['C.solo'].refsIn.length, 1, 'unique title resolves');

  // A genuinely ambiguous reference is reported with candidates, never guessed.
  assert.equal(ambiguous.length, 1);
  assert.deepEqual(ambiguous[0].candidates, ['A.dup', 'B.dup']);
  assert.equal(unresolved.length, 1);
  assert.equal(unresolved[0].title, 'Nonexistent');
});

test('abbreviated module qualifiers resolve by unique suffix', () => {
  const defs = [
    { id: 'GHC.CmmToAsm.X86.Instr.spill', title: 'extra spill slots', module: 'GHC.CmmToAsm.X86.Instr', file: 'x.hs', line: 1, body: '' },
  ];
  const { notes, unresolved } = resolveNotes(defs, [
    { title: 'extra spill slots', qualifier: 'X86.Instr', fromModule: 'GHC.CmmToAsm.PPC.Instr', file: 'p.hs', line: 3 },
  ]);
  assert.equal(unresolved.length, 0);
  assert.equal(notes[0].refsIn.length, 1);
});

test('noteId is stable and url-safe', () => {
  assert.equal(noteId('GHC.Tc.Solver', 'Wanteds rewrite Wanteds'), 'GHC.Tc.Solver.wanteds-rewrite-wanteds');
  assert.equal(noteId(null, 'The [odd] one!'), 'the-odd-one');
});
