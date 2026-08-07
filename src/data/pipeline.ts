/**
 * The compilation pipeline, as the handbook presents it.
 *
 * `modulePrefixes` are used to attribute extracted Notes to a phase, so the
 * density figures on the map are measured from the pinned source rather than
 * asserted by hand. `status` distinguishes phases with a written chapter from
 * those that are mapped but not yet covered in depth.
 */

export type PhaseStatus = 'chapter' | 'stub';

export interface Phase {
  id: string;
  name: string;
  /** One line: what this phase turns into what. */
  transform: string;
  blurb: string;
  status: PhaseStatus;
  /** Chapter slug, when a chapter exists. */
  slug?: string;
  modulePrefixes: string[];
  /** The headline entry point, for the "start reading the source here" link. */
  entryPoint?: { file: string; symbol: string };
}

export interface PipelinePart {
  id: string;
  title: string;
  summary: string;
  phases: Phase[];
}

export const pipeline: PipelinePart[] = [
  {
    id: 'frontend',
    title: 'The front end',
    summary:
      'Text becomes a typed, name-resolved syntax tree. Everything here is about establishing meaning: what the symbols refer to, and whether the program is well typed.',
    phases: [
      {
        id: 'lexer',
        name: 'Lexer',
        transform: 'characters → tokens',
        blurb:
          'Turns the source text into a token stream, tracking layout so that indentation becomes explicit braces and semicolons.',
        status: 'chapter',
        slug: 'parser',
        modulePrefixes: ['GHC.Parser.Lexer'],
        entryPoint: { file: 'compiler/GHC/Parser/Lexer.x', symbol: 'lexer' },
      },
      {
        id: 'parser',
        name: 'Parser',
        transform: 'tokens → HsSyn',
        blurb:
          'A Happy grammar that builds the surface syntax tree, preserving enough source detail to reprint the program exactly.',
        status: 'chapter',
        slug: 'parser',
        modulePrefixes: ['GHC.Parser'],
        entryPoint: { file: 'compiler/GHC/Parser.y', symbol: 'parseModule' },
      },
      {
        id: 'renamer',
        name: 'Renamer',
        transform: 'RdrName → Name',
        blurb:
          'Resolves every occurrence to the thing it names, resolves fixities, and reports what is unused or ambiguous.',
        status: 'chapter',
        slug: 'renamer',
        modulePrefixes: ['GHC.Rename'],
        entryPoint: { file: 'compiler/GHC/Rename/Module.hs', symbol: 'rnSrcDecls' },
      },
      {
        id: 'typechecker',
        name: 'Type checker',
        transform: 'Name → Id',
        blurb:
          'Generates constraints from the syntax tree and solves them. By far the largest phase, and the one that carries the most design reasoning.',
        status: 'chapter',
        slug: 'typechecker',
        modulePrefixes: ['GHC.Tc'],
        entryPoint: { file: 'compiler/GHC/Tc/Module.hs', symbol: 'tcRnModule' },
      },
      {
        id: 'desugarer',
        name: 'Desugarer',
        transform: 'HsSyn → Core',
        blurb:
          'Collapses the whole of Haskell into Core: a tiny explicitly-typed lambda calculus with just nine constructors.',
        status: 'stub',
        slug: 'desugarer',
        modulePrefixes: ['GHC.HsToCore'],
        entryPoint: { file: 'compiler/GHC/HsToCore.hs', symbol: 'deSugar' },
      },
    ],
  },
  {
    id: 'middle',
    title: 'The middle end',
    summary:
      'Core in, better Core out. This is where GHC earns its reputation: a long sequence of type-preserving transformations over a deliberately small language.',
    phases: [
      {
        id: 'core',
        name: 'Core',
        transform: 'the intermediate language',
        blurb:
          'System F-ish, explicitly typed, and small enough to fit on a page — which is exactly what makes the optimiser tractable.',
        status: 'stub',
        modulePrefixes: ['GHC.Core.Type', 'GHC.Core.TyCo', 'GHC.Core.Utils', 'GHC.Core.Lint'],
        entryPoint: { file: 'compiler/GHC/Core.hs', symbol: 'Expr' },
      },
      {
        id: 'simplifier',
        name: 'Simplifier',
        transform: 'Core → Core',
        blurb:
          'Inlining, beta reduction, case-of-case, and rewrite rules, run to a fixed point over several passes.',
        status: 'stub',
        modulePrefixes: ['GHC.Core.Opt'],
        entryPoint: { file: 'compiler/GHC/Core/Opt/Simplify.hs', symbol: 'simplTopBinds' },
      },
    ],
  },
  {
    id: 'backend',
    title: 'The back end',
    summary:
      'Types are erased, evaluation order is made explicit, and the program descends towards machine code.',
    phases: [
      {
        id: 'stg',
        name: 'STG',
        transform: 'Core → STG',
        blurb:
          'Makes allocation and evaluation explicit. Every closure and every thunk becomes visible in the syntax.',
        status: 'stub',
        modulePrefixes: ['GHC.Stg', 'GHC.CoreToStg'],
        entryPoint: { file: 'compiler/GHC/CoreToStg.hs', symbol: 'coreToStg' },
      },
      {
        id: 'cmm',
        name: 'Cmm',
        transform: 'STG → Cmm',
        blurb:
          'A C-like portable assembly with explicit stack and heap operations — the last target-independent form.',
        status: 'stub',
        modulePrefixes: ['GHC.Cmm', 'GHC.StgToCmm'],
        entryPoint: { file: 'compiler/GHC/StgToCmm.hs', symbol: 'codeGen' },
      },
      {
        id: 'codegen',
        name: 'Code generation',
        transform: 'Cmm → machine code',
        blurb:
          'The native code generator, the LLVM backend, or the bytecode generator for GHCi.',
        status: 'stub',
        modulePrefixes: ['GHC.CmmToAsm', 'GHC.CmmToLlvm', 'GHC.ByteCode', 'GHC.StgToByteCode'],
        entryPoint: { file: 'compiler/GHC/CmmToAsm.hs', symbol: 'nativeCodeGen' },
      },
    ],
  },
  {
    id: 'runtime',
    title: 'The runtime',
    summary:
      'Compiled code does not run alone. The RTS provides the storage manager, the scheduler, and the machinery that makes laziness and concurrency work.',
    phases: [
      {
        id: 'rts',
        name: 'Runtime system',
        transform: 'C, Cmm, and assembly',
        blurb:
          'Garbage collection, the lightweight thread scheduler, STM, and the evaluation machinery itself.',
        status: 'stub',
        modulePrefixes: [],
        entryPoint: { file: 'rts/Schedule.c', symbol: 'schedule' },
      },
    ],
  },
];

export const allPhases: Phase[] = pipeline.flatMap((p) => p.phases);

export function phaseById(id: string): Phase | undefined {
  return allPhases.find((p) => p.id === id);
}
