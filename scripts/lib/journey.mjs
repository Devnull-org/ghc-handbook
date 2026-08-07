/**
 * The function ledger behind the "follow one module" page: for each compiler
 * phase, the handful of real functions a new contributor should meet first.
 *
 * Every entry names a definition in the pinned GHC tree. `pattern` is matched
 * against the start of a line (column 0), because that is where Haskell
 * definitions and their signatures live; the first matching line wins. Some
 * signatures span several lines or name two functions at once, which is why a
 * few patterns are a bare name rather than `name ::`.
 *
 * gen-journey.mjs resolves each pattern to a line number and refuses to emit
 * anything if one no longer matches, so a re-pin that moves a function breaks
 * regeneration loudly instead of publishing a dead link.
 */

export const LEDGER = [
  {
    id: 'parse',
    title: 'Parsing',
    stage: 'parsed-ast',
    chapter: 'parser',
    functions: [
      {
        name: 'hscParse',
        file: 'compiler/GHC/Driver/Main.hs',
        pattern: 'hscParse ::',
        role: 'The driver’s entry into the phase: reads the file, runs the lexer and parser, returns the parsed module.',
      },
      {
        name: 'lexer',
        file: 'compiler/GHC/Parser/Lexer.x',
        pattern: 'lexer, lexerDbg ::',
        role: 'The alex-generated lexer, and home of the layout algorithm that turns indentation into virtual braces.',
      },
      {
        name: 'parseModuleNoHaddock',
        file: 'compiler/GHC/Parser.y',
        pattern: '%name parseModuleNoHaddock',
        role: 'The happy grammar’s entry production; GHC.Parser.parseModule is a thin wrapper around it.',
      },
      {
        name: 'runPV',
        file: 'compiler/GHC/Parser/PostProcess.hs',
        pattern: 'runPV ::',
        role: 'Runs the disambiguation monad in which expression-versus-pattern ambiguity is resolved after the grammar.',
      },
    ],
  },
  {
    id: 'rename',
    title: 'Renaming',
    stage: 'renamed',
    chapter: 'renamer',
    functions: [
      {
        name: 'tcRnModule',
        file: 'compiler/GHC/Tc/Module.hs',
        pattern: 'tcRnModule ::',
        role: 'Drives renaming and typechecking together, one declaration group at a time.',
      },
      {
        name: 'rnTopSrcDecls',
        file: 'compiler/GHC/Tc/Module.hs',
        pattern: 'rnTopSrcDecls ::',
        role: 'Renames the top-level declaration groups in dependency order.',
      },
      {
        name: 'rnValBindsRHS',
        file: 'compiler/GHC/Rename/Bind.hs',
        pattern: 'rnValBindsRHS ::',
        role: 'Renames the right-hand sides of value bindings, collecting free variables as it goes.',
      },
      {
        name: 'rnExpr',
        file: 'compiler/GHC/Rename/Expr.hs',
        pattern: 'rnExpr ::',
        role: 'One equation per expression form; where each RdrName becomes a Name.',
      },
      {
        name: 'lookupOccRn',
        file: 'compiler/GHC/Rename/Env.hs',
        pattern: 'lookupOccRn ::',
        role: 'The lookup itself: one occurrence, resolved against everything in scope.',
      },
    ],
  },
  {
    id: 'typecheck',
    title: 'Typechecking',
    stage: 'typechecked',
    chapter: 'typechecker',
    functions: [
      {
        name: 'tcTopBinds',
        file: 'compiler/GHC/Tc/Gen/Bind.hs',
        pattern: 'tcTopBinds ::',
        role: 'Typechecks top-level bindings and decides what gets generalised.',
      },
      {
        name: 'tcExpr',
        file: 'compiler/GHC/Tc/Gen/Expr.hs',
        pattern: 'tcExpr ::',
        role: 'One equation per expression form: constraint generation for terms.',
      },
      {
        name: 'tcApp',
        file: 'compiler/GHC/Tc/Gen/App.hs',
        pattern: 'tcApp ::',
        role: 'Applications, including the instantiation of polymorphic functions.',
      },
      {
        name: 'simplifyTop',
        file: 'compiler/GHC/Tc/Solver.hs',
        pattern: 'simplifyTop ::',
        role: 'Hands the collected WantedConstraints to the solver once the module has been walked.',
      },
      {
        name: 'solveWanteds',
        file: 'compiler/GHC/Tc/Solver/Solve.hs',
        pattern: 'solveWanteds ::',
        role: 'The solver loop: work list in, inert set maintained, residual constraints out.',
      },
    ],
  },
  {
    id: 'desugar',
    title: 'Desugaring',
    stage: 'core-desugared',
    chapter: 'desugarer',
    functions: [
      {
        name: 'deSugar',
        file: 'compiler/GHC/HsToCore.hs',
        pattern: 'deSugar ::',
        role: 'The phase entry: elaborated Haskell in, Core out.',
      },
      {
        name: 'dsTopLHsBinds',
        file: 'compiler/GHC/HsToCore/Binds.hs',
        pattern: 'dsTopLHsBinds ::',
        role: 'Top-level bindings, including the evidence bindings the solver left behind.',
      },
      {
        name: 'dsExpr',
        file: 'compiler/GHC/HsToCore/Expr.hs',
        pattern: 'dsExpr ::',
        role: 'One equation per expression form, each returning plain Core.',
      },
      {
        name: 'matchWrapper',
        file: 'compiler/GHC/HsToCore/Match.hs',
        pattern: 'matchWrapper',
        role: 'The pattern-match compiler: equations and guards become case trees.',
      },
    ],
  },
  {
    id: 'optimise',
    title: 'The simplifier',
    stage: 'core-optimised',
    chapter: 'simplifier',
    functions: [
      {
        name: 'getCoreToDo',
        file: 'compiler/GHC/Core/Opt/Pipeline.hs',
        pattern: 'getCoreToDo ::',
        role: 'Builds the list of passes the middle end will run at this optimisation level.',
      },
      {
        name: 'simplifyPgm',
        file: 'compiler/GHC/Core/Opt/Simplify.hs',
        pattern: 'simplifyPgm ::',
        role: 'One simplifier run: local rewrites applied everywhere, to a fixed point or the iteration cap.',
      },
      {
        name: 'occurAnalysePgm',
        file: 'compiler/GHC/Core/Opt/OccurAnal.hs',
        pattern: 'occurAnalysePgm ::',
        role: 'Answers how each binder is used; nearly every inlining decision consults it.',
      },
      {
        name: 'dmdAnalProgram',
        file: 'compiler/GHC/Core/Opt/DmdAnal.hs',
        pattern: 'dmdAnalProgram ::',
        role: 'Demand analysis: which arguments are certain to be evaluated.',
      },
      {
        name: 'wwTopBinds',
        file: 'compiler/GHC/Core/Opt/WorkWrap.hs',
        pattern: 'wwTopBinds ::',
        role: 'Worker/wrapper: turns demand information into unboxed workers.',
      },
    ],
  },
  {
    id: 'stg',
    title: 'STG',
    stage: 'stg',
    chapter: 'stg',
    functions: [
      {
        name: 'corePrepPgm',
        file: 'compiler/GHC/CoreToStg/Prep.hs',
        pattern: 'corePrepPgm ::',
        role: 'Normalises Core to A-normal form so the translation to STG is total.',
      },
      {
        name: 'coreToStg',
        file: 'compiler/GHC/CoreToStg.hs',
        pattern: 'coreToStg ::',
        role: 'The translation itself; on the far side of it, a let is an allocation.',
      },
      {
        name: 'unarise',
        file: 'compiler/GHC/Stg/Unarise.hs',
        pattern: 'unarise ::',
        role: 'Flattens unboxed tuples and sums away before code generation.',
      },
    ],
  },
  {
    id: 'codegen',
    title: 'Code generation',
    stage: null,
    chapter: 'cmm',
    functions: [
      {
        name: 'codeGen',
        file: 'compiler/GHC/StgToCmm.hs',
        pattern: 'codeGen ::',
        role: 'STG into C--, one closure at a time.',
      },
      {
        name: 'cmmPipeline',
        file: 'compiler/GHC/Cmm/Pipeline.hs',
        pattern: 'cmmPipeline',
        role: 'The C-- optimisation pipeline: stack layout and proc-point splitting.',
      },
      {
        name: 'nativeCodeGen',
        file: 'compiler/GHC/CmmToAsm.hs',
        pattern: 'nativeCodeGen ::',
        role: 'Instruction selection, register allocation, assembly out.',
      },
    ],
  },
];

/**
 * First line (1-based) starting at column 0 with `pattern`, or null.
 * Column 0 is deliberate: it skips export lists, comments and call sites,
 * which mention the name indented.
 */
export function resolveDefinition(source, pattern) {
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(pattern)) return i + 1;
  }
  return null;
}

/**
 * Resolve every ledger entry via `readSource(file) -> string | null`.
 * Returns { phases, unresolved }; the caller decides that unresolved entries
 * are fatal. Pure apart from the injected reader, so tests need no checkout.
 */
export function resolveLedger(ledger, readSource) {
  const unresolved = [];
  const phases = ledger.map((phase) => ({
    ...phase,
    functions: phase.functions.map((fn) => {
      const source = readSource(fn.file);
      const line = source == null ? null : resolveDefinition(source, fn.pattern);
      if (line == null) unresolved.push(`${fn.name} (${fn.file}: "${fn.pattern}")`);
      return { ...fn, line };
    }),
  }));
  return { phases, unresolved };
}
