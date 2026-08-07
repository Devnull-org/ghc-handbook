/**
 * Parse GHC's `-ddump-*-trace` style output into a tree.
 *
 * GHC's traces mark regions with braces — `solveWanteds {` ... `}` — which is
 * what makes an 8,000-line trace navigable as a fold-out tree instead of a
 * wall. But the convention is applied by hand at every trace site, and it is
 * sloppy: some functions (`tcInferTyApps` for one) open a brace and never emit
 * the closer. A naive stack parser would nest the rest of the file under them.
 *
 * Two rules keep the tree honest:
 *
 *   - Only *unindented* lines are structural. Everything GHC prints as payload
 *     (types, constraints, inert sets) is indented, so record braces inside a
 *     printed `IC { ... }` can never open or close a region.
 *   - A named closer (`End simplifyTop }`) pops to the frame it names, healing
 *     over any abandoned opens in between. A closer naming no open frame is
 *     demoted to an ordinary line rather than closing the wrong region.
 *
 * `-ddump-simpl-iterations` is a different animal — no braces, just Core
 * listings under `==== ... ====` banner lines — so banner-delimited input gets
 * flat sections instead of a brace tree.
 */

/** @typedef {{ label: string, body?: string, end?: string, children: Node[] }} Node */

const BANNER = /^={4,}\s*(.*?)\s*={4,}$/;

/** Tokens meaty enough to identify which opener a closer is naming. */
function labelTokens(text) {
  const words = text.match(/[A-Za-z_][A-Za-z0-9_:]+/g) ?? [];
  return words.filter((w) => w.length >= 4 && !['done', 'end', 'End', 'Result'].includes(w));
}

function closerNamesFrame(closer, frameLabel) {
  const ct = labelTokens(closer);
  const ft = labelTokens(frameLabel);
  return ct.some((c) => ft.some((f) => c.includes(f) || f.includes(c)));
}

/**
 * A structural opener is an unindented line ending in a standalone `{`, or
 * carrying one mid-line with payload after it (`checkInitialKinds { []`).
 * The standalone requirement is what keeps `Sym {co}` — a printed coercion
 * hole — from opening a region.
 */
function openerOf(line) {
  if (line === '{') return { label: '', payload: '' };
  if (line.endsWith(' {')) return { label: line.slice(0, -2).trim(), payload: '' };
  const mid = line.indexOf(' { ');
  if (mid !== -1) {
    return { label: line.slice(0, mid).trim(), payload: line.slice(mid + 3) };
  }
  return null;
}

function isCloser(line) {
  return line === '}' || line.endsWith(' }');
}

/** Strip `---- foo ----` dressing so tree labels read cleanly. */
function cleanLabel(label) {
  return label.replace(/^[-\s]+|[-\s]+$/g, '') || '{';
}

function makeNode(label) {
  return { label, children: [] };
}

function pushBody(node, line) {
  node.body = node.body == null ? line : node.body + '\n' + line;
}

/**
 * Parse one trace into a list of top-level nodes.
 * @returns {Node[]}
 */
export function parseTrace(text) {
  const lines = text.split('\n');
  if (lines.some((l) => BANNER.test(l))) return parseBanners(lines);

  const root = makeNode('');
  /** Stack of open frames; root is always at the bottom. */
  const stack = [root];
  /** Where indented payload attaches: the most recently created node. */
  let last = root;

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line === '') continue;

    if (/^\s/.test(raw)) {
      pushBody(last, line.trimStart() === line ? line : raw.trimEnd());
      continue;
    }

    const open = openerOf(line);
    if (open) {
      const node = makeNode(cleanLabel(open.label));
      if (open.payload) pushBody(node, open.payload);
      stack[stack.length - 1].children.push(node);
      stack.push(node);
      last = node;
      continue;
    }

    if (isCloser(line)) {
      if (line === '}') {
        if (stack.length > 1) stack.pop();
        last = stack[stack.length - 1];
        continue;
      }
      // Named closer: find the frame it names, healing over abandoned opens.
      let matched = false;
      for (let i = stack.length - 1; i >= 1; i--) {
        if (closerNamesFrame(line, stack[i].label)) {
          stack[i].end = line.slice(0, -2).trim();
          stack.length = i;
          last = stack[stack.length - 1];
          matched = true;
          break;
        }
      }
      if (!matched) {
        // An ordinary line that happens to end in ` }`. Record it rather
        // than closing the wrong region.
        const node = makeNode(line);
        stack[stack.length - 1].children.push(node);
        last = node;
      }
      continue;
    }

    const node = makeNode(line);
    stack[stack.length - 1].children.push(node);
    last = node;
  }

  return root.children;
}

/**
 * Banner-sectioned output (`-ddump-simpl-iterations`): each `==== X ====`
 * starts a flat section holding everything up to the next banner.
 */
function parseBanners(lines) {
  const sections = [];
  let current = null;
  for (const raw of lines) {
    const line = raw.trimEnd();
    const m = line.match(BANNER);
    if (m) {
      current = makeNode(m[1]);
      sections.push(current);
      continue;
    }
    if (line === '' && current?.body == null) continue;
    if (current == null) {
      current = makeNode('');
      sections.push(current);
    }
    pushBody(current, line);
  }
  for (const s of sections) s.body = s.body?.replace(/\n+$/, '');
  return sections;
}

/** Total line count of a subtree — what a collapsed summary advertises. */
export function nodeLines(node) {
  const own = 1 + (node.body ? node.body.split('\n').length : 0) + (node.end ? 1 : 0);
  return node.children.reduce((n, c) => n + nodeLines(c), own);
}
