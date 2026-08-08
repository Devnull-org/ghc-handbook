/**
 * The call paths behind the "follow one module" page: for each compiler phase,
 * the actual chain of functions GHC goes through when compiling the Journey
 * module, nested as caller and callee.
 *
 * Every node names a definition in the pinned GHC tree; `pattern` is matched
 * at column 0 and the first hit wins. Every parent-to-child edge is verified
 * mechanically by gen-journey.mjs: the child's name must occur in the parent's
 * body (for .y/.x grammar files, anywhere in the file, since happy and alex
 * wire calls through directives). A path that drifts from the real code after
 * a re-pin therefore breaks regeneration, never the published page.
 *
 * Where a descent hops through generic walkers whose plumbing would drown the
 * reader (the match and GRHS walkers), the phase carries a second root instead
 * of a fake edge: rnExpr and tcExpr are where every walker lands.
 */

const n = (name, file, pattern, role, children = []) => ({ name, file, pattern, role, children });

/** Nest nodes linearly: chain(a, b, c) makes a -> b -> c. The last node keeps its children. */
const chain = (...nodes) =>
  nodes.reduceRight((child, parent) => ({ ...parent, children: [...parent.children, child] }));

const M = 'compiler/GHC/Driver/Main.hs';
const TCM = 'compiler/GHC/Tc/Module.hs';
const TCB = 'compiler/GHC/Tc/Gen/Bind.hs';
const TCMATCH = 'compiler/GHC/Tc/Gen/Match.hs';
const RNB = 'compiler/GHC/Rename/Bind.hs';
const DSB = 'compiler/GHC/HsToCore/Binds.hs';
const PIPE = 'compiler/GHC/Core/Opt/Pipeline.hs';

export const LEDGER = [
  {
    id: 'parse',
    title: 'Parsing',
    stage: 'parsed-ast',
    chapter: 'parser',
    repr: {
      type: 'HsModule GhcPs',
      note: 'The syntax tree as parsed: "trees that grow", parameterised by phase, names still plain strings.',
    },
    keyFn: 'hscParse',
    paths: [
      chain(
        n('hscParse', M, 'hscParse ::', 'The driver asks for a parsed module.'),
        n("hscParse'", M, "hscParse' ::", 'The worker: reads the file, sets up the parser state.'),
        n('parseModule', 'compiler/GHC/Parser.y', 'parseModule ::', 'The entry point exported from the generated parser.'),
        n('parseModuleNoHaddock', 'compiler/GHC/Parser.y', '%name parseModuleNoHaddock', 'The happy grammar entry production. Everything below it is generated.', [
          n('lexer', 'compiler/GHC/Parser/Lexer.x', 'lexer, lexerDbg ::', 'Pulled per token by the parser; home of the layout algorithm.'),
          n('runPV', 'compiler/GHC/Parser/PostProcess.hs', 'runPV ::', 'Runs the disambiguation monad in grammar actions, where expression-versus-pattern ambiguity is resolved.'),
        ]),
      ),
    ],
  },
  {
    id: 'rename',
    title: 'Renaming',
    stage: 'renamed',
    chapter: 'renamer',
    repr: {
      type: 'HsGroup GhcRn',
      note: 'The same tree shape, but the phase parameter changed: every name is now a Name with a unique.',
    },
    keyFn: 'rnTopSrcDecls',
    paths: [
      chain(
        n('tcRnModule', TCM, 'tcRnModule ::', 'One entry point drives renaming and typechecking together.'),
        n('tcRnModuleTcRnM', TCM, 'tcRnModuleTcRnM ::', 'Sets up the module context: imports, exports, the local environment.'),
        n('tcRnSrcDecls', TCM, 'tcRnSrcDecls ::', 'Processes the declarations, then hands the collected constraints to the solver.'),
        n('tc_rn_src_decls', TCM, 'tc_rn_src_decls ::', 'The loop over declaration groups; Template Haskell splices force it to alternate renaming and typechecking.'),
        n('rnTopSrcDecls', TCM, 'rnTopSrcDecls ::', 'Renames one top-level group.'),
        n('rnSrcDecls', 'compiler/GHC/Rename/Module.hs', 'rnSrcDecls ::', 'Dispatches by declaration kind. Its signature is the phase in one line.'),
        n('rnValBindsRHS', RNB, 'rnValBindsRHS ::', 'Right-hand sides of value bindings, collecting free variables for dependency analysis.'),
        n('rnLBind', RNB, 'rnLBind ::', 'One located binding.'),
        n('rnBind', RNB, 'rnBind ::', 'The binding itself.'),
        n('rnMatchGroup', RNB, 'rnMatchGroup ::', 'Into the equations, and from here through the match walkers to every expression.'),
      ),
      chain(
        n('rnExpr', 'compiler/GHC/Rename/Expr.hs', 'rnExpr ::', 'Where the walkers land: one equation per expression form.'),
        n('lookupExprOccRn', 'compiler/GHC/Rename/Env.hs', 'lookupExprOccRn ::', 'The lookup itself: an occurrence, resolved against everything in scope.'),
      ),
    ],
  },
  {
    id: 'typecheck',
    title: 'Typechecking',
    stage: 'typechecked',
    chapter: 'typechecker',
    repr: {
      type: 'LHsBinds GhcTc',
      note: 'The third growth of the tree: every node knows its type, and evidence bindings have appeared.',
    },
    keyFn: 'tcTopBinds',
    paths: [
      chain(
        n('tc_rn_src_decls', TCM, 'tc_rn_src_decls ::', 'The same loop that renamed the group now typechecks it.'),
        n('tcTopSrcDecls', TCM, 'tcTopSrcDecls ::', 'One renamed group, typechecked kind by kind.'),
        n('tcTopBinds', TCB, 'tcTopBinds ::', 'The value bindings.'),
        n('tcValBinds', TCB, 'tcValBinds ::', 'Brings signatures into scope, then the groups.'),
        n('tcBindGroups', TCB, 'tcBindGroups ::', 'Strongly-connected groups, in dependency order.'),
        n('tc_group', TCB, 'tc_group ::', 'One group, recursive or not.'),
        n('tcPolyBinds', TCB, 'tcPolyBinds ::', 'Decides how to generalise the group.'),
        n('tcPolyCheck', TCB, 'tcPolyCheck ::', 'The path taken here, because both Journey functions have signatures: check against the signature, no inference needed.'),
        n('tcFunBindMatches', TCMATCH, 'tcFunBindMatches ::', 'A function binding’s equations against its type.'),
        n('tcMatches', TCMATCH, 'tcMatches ::', 'All equations get the same type.'),
        n('tcMatch', TCMATCH, 'tcMatch ::', 'One equation: patterns, then right-hand sides.'),
        n('tcGRHSs', TCMATCH, 'tcGRHSs ::', 'Guards and bodies; from here the walkers reach every expression.'),
      ),
      chain(
        n('tcExpr', 'compiler/GHC/Tc/Gen/Expr.hs', 'tcExpr ::', 'Where the walkers land: one equation per expression form, generating constraints.', [
          n('tcCaseMatches', TCMATCH, 'tcCaseMatches ::', 'Case alternatives: classify’s three branches are checked here.'),
        ]),
        n('tcApp', 'compiler/GHC/Tc/Gen/App.hs', 'tcApp ::', 'Applications, including instantiation: this is what show x goes through.'),
      ),
      chain(
        n('simplifyTop', 'compiler/GHC/Tc/Solver.hs', 'simplifyTop ::', 'After the walk: the collected WantedConstraints go to the solver.'),
        n('simplifyTopWanteds', 'compiler/GHC/Tc/Solver.hs', 'simplifyTopWanteds ::', 'The top-level solving strategy, including defaulting.'),
        n('solveWanteds', 'compiler/GHC/Tc/Solver/Solve.hs', 'solveWanteds ::', 'The solver loop: work list in, inert set maintained, residual constraints out.'),
      ),
    ],
  },
  {
    id: 'desugar',
    title: 'Desugaring',
    stage: 'core-desugared',
    chapter: 'desugarer',
    repr: {
      type: 'CoreProgram',
      note: 'A different language entirely: a handful of constructors, and no sugar left.',
    },
    keyFn: 'dsTopLHsBinds',
    paths: [
      chain(
        n('hscDesugar', M, 'hscDesugar ::', 'The driver moves to Core.'),
        n("hscDesugar'", M, "hscDesugar' ::", 'The worker behind the -Werror-safe wrapper.'),
        n('deSugar', 'compiler/GHC/HsToCore.hs', 'deSugar ::', 'The phase entry: elaborated Haskell in, Core out.'),
        n('dsTopLHsBinds', DSB, 'dsTopLHsBinds ::', 'Top-level bindings, including the evidence the solver left behind.'),
        n('dsLHsBinds', DSB, 'dsLHsBinds ::', 'The list.'),
        n('dsLHsBind', DSB, 'dsLHsBind ::', 'One located binding.'),
        n('dsHsBind', DSB, 'dsHsBind ::', 'The binding itself; AbsBinds is where dictionary abstraction becomes a lambda.'),
        n('dsLExpr', 'compiler/GHC/HsToCore/Expr.hs', 'dsLExpr ::', 'Into the expression.'),
        n('dsExpr', 'compiler/GHC/HsToCore/Expr.hs', 'dsExpr ::', 'One equation per expression form, each returning plain Core.'),
        n('matchWrapper', 'compiler/GHC/HsToCore/Match.hs', 'matchWrapper', 'The pattern-match compiler’s front door.'),
        n('match', 'compiler/GHC/HsToCore/Match.hs', 'match ::', 'Equations and guards become case trees; classify’s case is compiled here.'),
      ),
    ],
  },
  {
    id: 'optimise',
    title: 'The simplifier',
    stage: 'core-optimised',
    chapter: 'simplifier',
    repr: {
      type: 'CoreProgram',
      note: 'Same type in, same type out. The entire middle end is Core to Core.',
    },
    keyFn: 'simplifyPgm',
    paths: [
      chain(
        n('hscSimplify', M, 'hscSimplify ::', 'The driver hands Core to the middle end.'),
        n("hscSimplify'", M, "hscSimplify' ::", 'The worker, with plugins loaded.'),
        n('core2core', PIPE, 'core2core ::', 'The middle end as a whole.', [
          n('getCoreToDo', PIPE, 'getCoreToDo ::', 'Builds the pass list for this optimisation level. Read it to learn what -O actually means.'),
        ]),
        n('runCorePasses', PIPE, 'runCorePasses ::', 'Folds the program through the passes.'),
        n('doCorePass', PIPE, 'doCorePass ::', 'Dispatches one pass.'),
        n('simplifyPgm', 'compiler/GHC/Core/Opt/Simplify.hs', 'simplifyPgm ::', 'One simplifier run: rewrites applied everywhere, to a fixed point or the iteration cap.', [
          n('occurAnalysePgm', 'compiler/GHC/Core/Opt/OccurAnal.hs', 'occurAnalysePgm ::', 'Runs before each iteration; nearly every inlining decision consults its output.'),
        ]),
        n('simplTopBinds', 'compiler/GHC/Core/Opt/Simplify/Iteration.hs', 'simplTopBinds ::', 'Walks every top-level binding; the rewrites live under it.'),
      ),
    ],
  },
  {
    id: 'stg',
    title: 'STG',
    stage: 'stg',
    chapter: 'stg',
    repr: {
      type: '[StgTopBinding]',
      note: 'Operational at last: closures with listed free variables, update flags, saturated applications.',
    },
    keyFn: 'coreToStg',
    paths: [
      chain(
        n('hscGenHardCode', M, 'hscGenHardCode ::', 'The driver’s back-end entry: everything from optimised Core to object code.', [
          n('corePrepPgm', 'compiler/GHC/CoreToStg/Prep.hs', 'corePrepPgm ::', 'Normalises Core to A-normal form; describe_sat in the dump is its work.'),
        ]),
        n('myCoreToStg', M, 'myCoreToStg ::', 'The Core-to-STG leg.', [
          n('coreToStg', 'compiler/GHC/CoreToStg.hs', 'coreToStg ::', 'The translation itself; on the far side, a let is an allocation.'),
        ]),
        n('stg2stg', 'compiler/GHC/Stg/Pipeline.hs', 'stg2stg ::', 'The STG-to-STG pass pipeline.'),
        n('unarise', 'compiler/GHC/Stg/Unarise.hs', 'unarise ::', 'Flattens unboxed tuples and sums away.'),
      ),
    ],
  },
  {
    id: 'codegen',
    title: 'Code generation',
    stage: null,
    chapter: 'cmm',
    repr: {
      type: 'CmmGroup',
      note: 'An imperative program: procedures, an explicit stack, registers and jumps.',
    },
    keyFn: 'codeGen',
    paths: [
      n('hscGenHardCode', M, 'hscGenHardCode ::', 'The same back-end entry, continuing past STG.', [
        chain(
          n('doCodeGen', M, 'doCodeGen ::', 'STG to C--, as a stream.', [
            n('codeGen', 'compiler/GHC/StgToCmm.hs', 'codeGen ::', 'One closure at a time.'),
          ]),
          n('cmmPipeline', 'compiler/GHC/Cmm/Pipeline.hs', 'cmmPipeline', 'The C-- optimisation pipeline: stack layout, proc-point splitting.'),
        ),
        chain(
          n('codeOutput', 'compiler/GHC/Driver/CodeOutput.hs', 'codeOutput', 'Writes whatever the target wants: assembly, LLVM, C.'),
          n('outputAsm', 'compiler/GHC/Driver/CodeOutput.hs', 'outputAsm ::', 'The native-assembly branch.'),
          n('nativeCodeGen', 'compiler/GHC/CmmToAsm.hs', 'nativeCodeGen ::', 'Instruction selection, register allocation, assembly out.'),
        ),
      ]),
    ],
  },
];

/** Depth-first flatten of a phase's paths. */
export function flattenPaths(paths) {
  const out = [];
  const walk = (node) => {
    out.push(node);
    for (const c of node.children) walk(c);
  };
  for (const root of paths) walk(root);
  return out;
}

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
 * The definition's own text, starting at `line` (1-based): the first line plus
 * any indented continuation lines. Multi-line Haskell signatures indent their
 * continuations, so this captures `matchWrapper\n  :: HsMatchContext ...` in
 * full while stopping cleanly at the next top-level line or a blank. Capped so
 * a surprise never embeds pages of source in the JSON.
 */
export function extractSignature(source, line, cap = 10) {
  const lines = source.split('\n');
  const out = [lines[line - 1]];
  for (let i = line; i < lines.length && out.length < cap; i++) {
    const l = lines[i];
    if (l.trim() === '' || !/^[ \t]/.test(l)) break;
    out.push(l);
  }
  return out.join('\n').trimEnd();
}

/**
 * Everything that belongs to `name` at the top level of a module: every
 * column-0 region that starts with the name (signature, each equation, their
 * indented continuations). GHC interleaves helper definitions and comment
 * prose between a function's equations, so a single start-to-next-definition
 * slice misses real code; collecting all regions does not.
 */
export function functionBody(source, name) {
  const lines = source.split('\n');
  const out = [];
  let inRegion = false;
  const starts = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w'])`);
  for (const l of lines) {
    if (starts.test(l)) inRegion = true;
    else if (/^\S/.test(l)) inRegion = false;
    if (inRegion) out.push(l);
  }
  return out.join('\n');
}

/** Does `body` mention `callee` as a standalone name (qualified calls count)? */
export function mentions(body, callee) {
  const esc = callee.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\w'])${esc}(?![\\w'])`).test(body);
}

/**
 * Resolve every node via `readSource(file) -> string | null` and verify every
 * caller-to-callee edge. Grammar and lexer files (.y/.x) are checked at file
 * scope, because happy and alex wire calls through directives rather than
 * Haskell bodies. Returns { phases, unresolved, unverified }; the caller
 * decides both lists are fatal. Pure apart from the injected reader.
 */
export function resolveLedger(ledger, readSource) {
  const unresolved = [];
  const unverified = [];

  const resolveNode = (node) => {
    const source = readSource(node.file);
    const line = source == null ? null : resolveDefinition(source, node.pattern);
    if (line == null) unresolved.push(`${node.name} (${node.file}: "${node.pattern}")`);
    const signature = line == null ? null : extractSignature(source, line);

    const parentScope =
      source == null
        ? null
        : node.file.endsWith('.y') || node.file.endsWith('.x')
          ? source
          : functionBody(source, node.name);

    const children = node.children.map((child) => {
      if (parentScope != null && !mentions(parentScope, child.name)) {
        unverified.push(`${node.name} -> ${child.name} (${node.file})`);
      }
      return resolveNode(child);
    });

    return { ...node, line, signature, children };
  };

  const phases = ledger.map((phase) => ({
    ...phase,
    paths: phase.paths.map(resolveNode),
  }));

  return { phases, unresolved, unverified };
}
