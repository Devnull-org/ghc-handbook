/**
 * Render a Note body to HTML.
 *
 * Note bodies are plain text, but they are *formatted* plain text: hard-wrapped
 * prose interleaved with code fragments, inference rules and ASCII diagrams
 * whose alignment carries meaning. So the body is reproduced verbatim in a
 * monospaced block rather than reflowed as prose, and we inject links for the
 * two things GHC authors cross-reference by hand: other Notes, and tickets.
 */
import { loadNotes, issueUrl, type Note } from './ghc';
import { withBase } from './paths';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let titleIndex: Map<string, Note[]> | null = null;

function byTitle(): Map<string, Note[]> {
  if (!titleIndex) {
    titleIndex = new Map();
    for (const n of loadNotes().notes) {
      const list = titleIndex.get(n.title);
      if (list) list.push(n);
      else titleIndex.set(n.title, [n]);
    }
  }
  return titleIndex;
}

/**
 * Resolve a `Note [...]` mention to a specific Note.
 *
 * Mirrors the extractor's ordering exactly — explicit qualifier, then same
 * module, then a globally unique title — so what the site links to is what the
 * extractor counted. Ambiguous mentions stay unlinked rather than guessing.
 */
export function resolveRef(
  title: string,
  qualifier: string | null,
  fromModule: string | null,
): Note | null {
  const candidates = byTitle().get(title);
  if (!candidates || candidates.length === 0) return null;

  if (qualifier) {
    const exact = candidates.find((c) => c.module === qualifier);
    if (exact) return exact;
    const suffix = candidates.filter((c) => c.module?.endsWith(`.${qualifier}`));
    return suffix.length === 1 ? suffix[0]! : null;
  }

  if (candidates.length === 1) return candidates[0]!;
  return candidates.find((c) => c.module === fromModule) ?? null;
}

const NOTE_REF = /Note \[([^\]]+)\]((?:\s+in\s+)([A-Z][A-Za-z0-9_.']*))?/g;
const TICKET = /#(\d{3,6})\b/g;

/**
 * @param body      raw Note body
 * @param fromModule module the Note lives in, used for same-module resolution
 * @param selfId    the Note being rendered, so self-references are not linked
 */
export function renderNoteBody(
  body: string,
  fromModule: string | null,
  selfId?: string,
): string {
  // Work on escaped text so injected markup is the only markup present.
  let html = escapeHtml(body);

  html = html.replace(NOTE_REF, (match, title: string, _tail, qualifier?: string) => {
    const q = qualifier ? qualifier.replace(/\.+$/, '') : null;
    const target = resolveRef(title, q, fromModule);
    if (!target || target.id === selfId) return match;
    const href = withBase(`/notes/${encodeURIComponent(target.id)}/`);
    return `<a class="note-ref" href="${href}">${match}</a>`;
  });

  html = html.replace(TICKET, (match, id: string) => {
    return `<a class="ticket-ref" href="${issueUrl(id)}" rel="noopener">${match}</a>`;
  });

  return html;
}
