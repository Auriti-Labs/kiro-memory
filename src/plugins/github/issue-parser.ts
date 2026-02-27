/**
 * Parser per riferimenti a issue GitHub.
 *
 * Estrae pattern come:
 *   - #123 (solo numero)
 *   - owner/repo#123 (con owner e repo)
 *   - closes #123, fixes #123, resolves #123 (keyword + numero)
 *
 * Deduplicazione automatica dei risultati.
 */

// ── Tipi ─────────────────────────────────────────────────────────────────────

export interface IssueReference {
  /** Numero della issue (es. 123) */
  number: number;
  /** Owner del repository, se specificato (es. "Auriti-Labs") */
  owner?: string;
  /** Nome del repository, se specificato (es. "kiro-memory") */
  repo?: string;
  /** Keyword associata, se presente (es. "closes", "fixes", "resolves") */
  keyword?: string;
}

// ── Pattern regex ────────────────────────────────────────────────────────────

/**
 * Pattern per keyword + issue reference.
 * Supporta: closes, close, fix, fixes, fixed, resolve, resolves, resolved
 * Seguito da: #N o owner/repo#N
 */
const KEYWORD_PATTERN = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+(?:([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+))?#(\d+)\b/gi;

/**
 * Pattern per owner/repo#N (senza keyword).
 * Richiede almeno un carattere prima della slash per distinguere da #N standalone.
 */
const FULL_REF_PATTERN = /(?:^|[\s,(])([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)#(\d+)\b/g;

/**
 * Pattern per #N standalone (senza keyword e senza owner/repo).
 * Evita match dentro URL, email e path di file.
 * Richiede inizio riga, spazio o punteggiatura prima del #.
 */
const STANDALONE_PATTERN = /(?:^|[\s,(:])#(\d+)\b/g;

// ── Parser ───────────────────────────────────────────────────────────────────

/**
 * Estrae tutti i riferimenti a issue da una stringa di testo.
 * Gestisce titoli, narrative, commit messages, etc.
 *
 * I risultati sono deduplicati: se la stessa issue appare più volte
 * (es. con e senza keyword), viene restituita una sola volta,
 * con precedenza alla versione più specifica (con keyword/owner).
 */
export function parseIssueReferences(text: string): IssueReference[] {
  if (!text || typeof text !== 'string') return [];

  const refs = new Map<string, IssueReference>();

  // 1. Keyword pattern (più specifico)
  let match: RegExpExecArray | null;
  KEYWORD_PATTERN.lastIndex = 0;
  while ((match = KEYWORD_PATTERN.exec(text)) !== null) {
    const owner = match[1] || undefined;
    const repo = match[2] || undefined;
    const number = parseInt(match[3], 10);
    const keyword = match[0].split(/\s/)[0].toLowerCase();
    const key = makeKey(owner, repo, number);

    // La versione con keyword ha precedenza
    refs.set(key, { number, owner, repo, keyword });
  }

  // 2. Full reference pattern (owner/repo#N)
  FULL_REF_PATTERN.lastIndex = 0;
  while ((match = FULL_REF_PATTERN.exec(text)) !== null) {
    const owner = match[1];
    const repo = match[2];
    const number = parseInt(match[3], 10);
    const key = makeKey(owner, repo, number);

    // Non sovrascrivere se già trovato con keyword
    if (!refs.has(key)) {
      refs.set(key, { number, owner, repo });
    }
  }

  // 3. Standalone #N (meno specifico)
  STANDALONE_PATTERN.lastIndex = 0;
  while ((match = STANDALONE_PATTERN.exec(text)) !== null) {
    const number = parseInt(match[1], 10);
    const key = makeKey(undefined, undefined, number);

    // Non sovrascrivere se già trovato con owner/repo o keyword
    if (!refs.has(key) && !hasRefWithNumber(refs, number)) {
      refs.set(key, { number });
    }
  }

  return Array.from(refs.values());
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Chiave univoca per deduplicazione.
 * Se owner/repo sono specificati, li include nella chiave.
 */
function makeKey(owner?: string, repo?: string, number?: number): string {
  if (owner && repo) {
    return `${owner}/${repo}#${number}`;
  }
  return `#${number}`;
}

/**
 * Verifica se esiste già un riferimento con lo stesso numero issue,
 * anche se con owner/repo diversi o non specificati.
 */
function hasRefWithNumber(refs: Map<string, IssueReference>, number: number): boolean {
  for (const ref of refs.values()) {
    if (ref.number === number) return true;
  }
  return false;
}
