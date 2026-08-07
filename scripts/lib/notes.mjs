/**
 * Parser for GHC's `Note [...]` convention.
 *
 * GHC's institutional knowledge lives in ~2000 of these comments. They follow a
 * convention, not an enforced format, so this parser is deliberately explicit
 * about which shapes it accepts and reports anything it cannot resolve rather
 * than dropping it silently.
 *
 * A *definition* is a line whose content, after stripping comment syntax, is
 * exactly `Note [Title]`, immediately followed by a line of `~~~~`. Three
 * comment shapes carry them:
 *
 *     {-                     {- Note [Title]        -- Note [Title]
 *     Note [Title]           ~~~~~~~~~~~~~~~        -- ~~~~~~~~~~~~
 *     ~~~~~~~~~~~~           body                   -- body
 *     body                   -}
 *     -}
 *
 * A *reference* is any other `Note [Title]` occurrence, optionally qualified
 * with `in GHC.Some.Module`.
 */

/**
 * Strip leading whitespace and any comment-opening syntax from a line.
 *
 * Covers Haskell (`{-`, `--`) and the C/Cmm used by the RTS (`/*`, `//`, and
 * the ` * ` continuation prefix of a block comment).
 */
function stripCommentSyntax(line) {
  return line
    .replace(/^\s*/, '')
    .replace(/^\/\*+\s*/, '') // `/*`, `/**`
    .replace(/^\{-+\s*/, '') // `{-`, `{--`
    .replace(/^\*(?!\/)\s?/, '') // ` * ` continuation, but not the `*/` closer
    .replace(/^(--+|\/\/+)\s?/, '') // `--`, `//`
    .trimEnd();
}

/**
 * Strip the comment prefix from a body line, preserving relative indentation.
 *
 * `cStyle` matters: in a C block comment a leading `*` is the continuation
 * marker and must go, but in a Haskell `{- -}` comment it is a bullet (GHC's
 * Notes are full of `* (Efficiency) ...` lists) and must stay.
 */
function stripBodyPrefix(line, cStyle) {
  if (cStyle) return line.replace(/^(\s*)(?:--+|\/\/+|\*(?!\/))\s?/, '$1');
  return line.replace(/^(\s*)(?:--+)\s?/, '$1');
}

/** True when a line is an underline of tildes, e.g. `~~~~~~~`. */
function isUnderline(stripped) {
  return /^~{3,}$/.test(stripped);
}

/** Match a bare `Note [Title]` line. Titles may contain `]`, so match to the last one. */
function matchDefinitionTitle(stripped) {
  const m = /^Note \[(.+)\]$/.exec(stripped);
  return m ? m[1] : null;
}

/**
 * Derive a module name from a file path.
 *
 *   compiler/GHC/Tc/Solver.hs                            -> GHC.Tc.Solver
 *   compiler/Language/Haskell/Syntax/Expr.hs             -> Language.Haskell.Syntax.Expr
 *   libraries/ghc-internal/src/GHC/Internal/Coerce.hs    -> GHC.Internal.Coerce
 *   rts/Interpreter.c                                    -> null (not a module)
 *
 * Rather than hardcoding source roots (which differ per package and change over
 * time), take the longest trailing run of path segments that look like module
 * components. Build-layout directories such as `src/` or `ghc-internal/` are
 * lowercase and therefore excluded automatically.
 */
export function moduleNameFromPath(path) {
  const p = path.replace(/\\/g, '/');
  const m = /^(.*?)\.(?:hs|hs-boot|y|x)$/.exec(p);
  if (!m) return null;

  const parts = m[1].split('/');
  const moduleSegment = /^[A-Z][A-Za-z0-9_']*$/;

  let start = parts.length;
  while (start > 0 && moduleSegment.test(parts[start - 1])) start--;

  const segments = parts.slice(start);
  return segments.length > 0 ? segments.join('.') : null;
}

/** Stable slug used for URLs and cross-linking. */
export function noteId(moduleName, title) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return moduleName ? `${moduleName}.${slug}` : slug;
}

/** Remove the common leading indentation from a block of body lines. */
function dedent(lines) {
  const indents = lines
    .filter((l) => l.trim() !== '')
    .map((l) => l.match(/^ */)[0].length);
  if (indents.length === 0) return lines;
  const min = Math.min(...indents);
  return lines.map((l) => l.slice(min));
}

function trimBlankEdges(lines) {
  const out = [...lines];
  while (out.length && out[0].trim() === '') out.shift();
  while (out.length && out[out.length - 1].trim() === '') out.pop();
  return out;
}

/**
 * Parse one source file.
 *
 * @returns {{definitions: Array, references: Array}}
 */
export function parseSource(text, path = '') {
  const lines = text.split('\n');
  const moduleName = moduleNameFromPath(path);
  const definitions = [];
  const definitionLines = new Set();

  for (let i = 0; i < lines.length - 1; i++) {
    const stripped = stripCommentSyntax(lines[i]);
    const title = matchDefinitionTitle(stripped);
    if (!title) continue;
    if (!isUnderline(stripCommentSyntax(lines[i + 1]))) continue;

    definitionLines.add(i);
    definitionLines.add(i + 1);

    // The comment shape of the *title* line decides how the body terminates and
    // which prefixes are decoration rather than content.
    const lineCommentMode = /^\s*(--|\/\/)/.test(lines[i]);
    const cStyle = /^\s*(\/\*|\/\/|\*)/.test(lines[i]);
    const body = [];

    const startsNextNote = (j) =>
      matchDefinitionTitle(stripCommentSyntax(lines[j])) &&
      isUnderline(stripCommentSyntax(lines[j + 1] ?? ''));

    for (let j = i + 2; j < lines.length; j++) {
      const raw = lines[j];

      if (lineCommentMode) {
        // Body runs while the lines stay line comments.
        if (!/^\s*(--|\/\/)/.test(raw)) break;
        if (startsNextNote(j)) break;
        body.push(stripBodyPrefix(raw, cStyle));
        continue;
      }

      // Block-comment mode: stop at the next definition or the block terminator.
      if (startsNextNote(j)) break;
      const closer = raw.includes('-}') ? '-}' : raw.includes('*/') ? '*/' : null;
      if (closer) {
        const head = stripBodyPrefix(raw.slice(0, raw.indexOf(closer)), cStyle);
        if (head.trim() !== '') body.push(head);
        break;
      }
      body.push(stripBodyPrefix(raw, cStyle));
    }

    const bodyText = trimBlankEdges(dedent(trimBlankEdges(body))).join('\n');

    definitions.push({
      id: noteId(moduleName, title),
      title,
      module: moduleName,
      file: path,
      line: i + 1, // 1-indexed, for source links
      body: bodyText,
      tickets: [...new Set(Array.from(bodyText.matchAll(/#(\d{3,6})\b/g), (m) => m[1]))],
    });
  }

  // References: every `Note [...]` occurrence that is not part of a definition
  // header. An optional `in GHC.Module` qualifier disambiguates the target.
  const references = [];
  for (let i = 0; i < lines.length; i++) {
    if (definitionLines.has(i)) continue;
    const line = lines[i];
    for (const m of line.matchAll(/Note \[([^\]]+)\]((?:\s+in\s+)([A-Z][A-Za-z0-9_.']*))?/g)) {
      // In `... in GHC.Builtin.Types.` the final dot is sentence punctuation, not
      // part of the module name. Trailing dots are never valid in a module name.
      const qualifier = m[3] ? m[3].replace(/\.+$/, '') : null;
      references.push({
        title: m[1],
        qualifier,
        fromModule: moduleName,
        file: path,
        line: i + 1,
      });
    }
  }

  return { definitions, references };
}

/**
 * Resolve references against the set of definitions and attach backlinks.
 *
 * Titles are NOT globally unique in GHC, so resolution is ordered:
 *   explicit `in Module` qualifier -> same module -> globally unique title.
 * Anything else is reported as ambiguous or unresolved, never guessed.
 */
export function resolveNotes(definitions, references) {
  const byId = new Map(definitions.map((d) => [d.id, d]));
  const byTitle = new Map();
  for (const d of definitions) {
    if (!byTitle.has(d.title)) byTitle.set(d.title, []);
    byTitle.get(d.title).push(d);
  }

  const notes = definitions.map((d) => ({ ...d, refsOut: [], refsIn: [] }));
  const notesById = new Map(notes.map((n) => [n.id, n]));

  const unresolved = [];
  const ambiguous = [];

  for (const ref of references) {
    const candidates = byTitle.get(ref.title);
    if (!candidates || candidates.length === 0) {
      unresolved.push(ref);
      continue;
    }

    let target = null;
    if (ref.qualifier) {
      target = candidates.find((c) => c.module === ref.qualifier) ?? null;

      // GHC comments routinely abbreviate the module: `in X86`, `in CLabel`,
      // `in RepType`. Accept a suffix match, but only when it is unambiguous.
      if (!target) {
        const suffix = candidates.filter((c) => c.module?.endsWith(`.${ref.qualifier}`));
        if (suffix.length === 1) target = suffix[0];
      }

      // A qualifier that still does not resolve is a real signal: either the
      // Note moved or the comment is stale. Record it rather than guessing.
      if (!target) {
        unresolved.push({ ...ref, reason: 'qualifier-not-found' });
        continue;
      }
    } else if (candidates.length === 1) {
      target = candidates[0];
    } else {
      const sameModule = candidates.find((c) => c.module === ref.fromModule);
      if (sameModule) {
        target = sameModule;
      } else {
        ambiguous.push({ ...ref, candidates: candidates.map((c) => c.id) });
        continue;
      }
    }

    const targetNote = notesById.get(target.id);
    const sourceNote = findEnclosingNote(notes, ref);

    if (sourceNote && sourceNote.id !== targetNote.id) {
      if (!sourceNote.refsOut.includes(targetNote.id)) sourceNote.refsOut.push(targetNote.id);
    }
    const backlink = {
      id: sourceNote ? sourceNote.id : null,
      module: ref.fromModule,
      file: ref.file,
      line: ref.line,
    };
    targetNote.refsIn.push(backlink);
  }

  return { notes, byId, unresolved, ambiguous };
}

/**
 * Find which Note (if any) a reference sits inside, so chapter-level "this Note
 * links to that Note" edges are real edges rather than file-level proximity.
 */
function findEnclosingNote(notes, ref) {
  let best = null;
  for (const n of notes) {
    if (n.file !== ref.file) continue;
    const endLine = n.line + 1 + n.body.split('\n').length;
    if (ref.line >= n.line && ref.line <= endLine) {
      if (!best || n.line > best.line) best = n;
    }
  }
  return best;
}

/** Build a source URL from the pin config. */
export function sourceUrl(pin, path, line, { mirror = false } = {}) {
  const tmpl = mirror ? pin.mirror.blobUrl : pin.canonical.blobUrl;
  return tmpl
    .replace('{tag}', pin.tag)
    .replace('{path}', path)
    .replace('{line}', String(line));
}
