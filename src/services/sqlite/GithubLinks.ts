/**
 * Operazioni CRUD per la tabella github_links.
 *
 * Ogni funzione riceve la Database instance come primo parametro
 * (stessa convenzione degli altri moduli sqlite del progetto).
 */

import { Database } from 'bun:sqlite';

// ── Tipi ──

export interface GithubLink {
  id: number;
  observation_id: number | null;
  session_id: string | null;
  repo: string;
  issue_number: number | null;
  pr_number: number | null;
  event_type: string;
  action: string | null;
  title: string | null;
  url: string | null;
  author: string | null;
  created_at: string;
  created_at_epoch: number;
}

export interface CreateGithubLinkData {
  observation_id?: number | null;
  session_id?: string | null;
  repo: string;
  issue_number?: number | null;
  pr_number?: number | null;
  event_type: string;
  action?: string | null;
  title?: string | null;
  url?: string | null;
  author?: string | null;
}

export interface GithubLinksSearchOptions {
  repo?: string;
  event_type?: string;
  limit?: number;
}

export interface RepoLinkCount {
  repo: string;
  count: number;
  last_event_at: string;
}

// ── Funzioni CRUD ──

/**
 * Inserisce un nuovo link GitHub nel database.
 * Restituisce l'ID della riga appena creata.
 */
export function createGithubLink(db: Database, data: CreateGithubLinkData): number {
  const now = new Date();
  const result = db.run(
    `INSERT INTO github_links
     (observation_id, session_id, repo, issue_number, pr_number, event_type,
      action, title, url, author, created_at, created_at_epoch)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.observation_id ?? null,
      data.session_id ?? null,
      data.repo,
      data.issue_number ?? null,
      data.pr_number ?? null,
      data.event_type,
      data.action ?? null,
      data.title ?? null,
      data.url ?? null,
      data.author ?? null,
      now.toISOString(),
      now.getTime(),
    ]
  );
  return Number(result.lastInsertRowid);
}

/**
 * Recupera tutti i link associati a una specifica observation.
 * Ordinati per data di creazione decrescente.
 */
export function getGithubLinksByObservation(db: Database, observationId: number): GithubLink[] {
  return db.query(
    `SELECT * FROM github_links
     WHERE observation_id = ?
     ORDER BY created_at_epoch DESC, id DESC`
  ).all(observationId) as GithubLink[];
}

/**
 * Recupera i link per un dato repository con limite opzionale.
 * Ordinati per data di creazione decrescente.
 */
export function getGithubLinksByRepo(
  db: Database,
  repo: string,
  limit: number = 50
): GithubLink[] {
  return db.query(
    `SELECT * FROM github_links
     WHERE repo = ?
     ORDER BY created_at_epoch DESC, id DESC
     LIMIT ?`
  ).all(repo, limit) as GithubLink[];
}

/**
 * Recupera i link relativi a una specifica issue di un repository.
 * Ordinati per data di creazione decrescente.
 */
export function getGithubLinksByIssue(
  db: Database,
  repo: string,
  issueNumber: number
): GithubLink[] {
  return db.query(
    `SELECT * FROM github_links
     WHERE repo = ? AND issue_number = ?
     ORDER BY created_at_epoch DESC, id DESC`
  ).all(repo, issueNumber) as GithubLink[];
}

/**
 * Recupera i link relativi a una specifica Pull Request di un repository.
 * Ordinati per data di creazione decrescente.
 */
export function getGithubLinksByPR(
  db: Database,
  repo: string,
  prNumber: number
): GithubLink[] {
  return db.query(
    `SELECT * FROM github_links
     WHERE repo = ? AND pr_number = ?
     ORDER BY created_at_epoch DESC, id DESC`
  ).all(repo, prNumber) as GithubLink[];
}

/**
 * Ricerca nei link GitHub per repository, tipo di evento e/o testo nel titolo.
 * Supporta filtro per repo e event_type con un limite configurabile.
 */
export function searchGithubLinks(
  db: Database,
  query: string,
  options: GithubLinksSearchOptions = {}
): GithubLink[] {
  const { repo, event_type, limit = 50 } = options;
  const safeLimit = Math.min(Math.max(1, limit), 200);

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  // Filtro full-text su title o url
  if (query && query.trim().length > 0) {
    const pattern = `%${query.replace(/[%_\\]/g, '\\$&')}%`;
    conditions.push(`(title LIKE ? ESCAPE '\\' OR url LIKE ? ESCAPE '\\')`);
    params.push(pattern, pattern);
  }

  if (repo) {
    conditions.push('repo = ?');
    params.push(repo);
  }

  if (event_type) {
    conditions.push('event_type = ?');
    params.push(event_type);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(safeLimit);

  return db.query(
    `SELECT * FROM github_links
     ${where}
     ORDER BY created_at_epoch DESC, id DESC
     LIMIT ?`
  ).all(...params) as GithubLink[];
}

/**
 * Lista i repository con il conteggio dei link e la data dell'ultimo evento.
 * Utile per la UI di riepilogo dei repo monitorati.
 */
export function listReposWithLinkCount(db: Database): RepoLinkCount[] {
  return db.query(
    `SELECT repo,
            COUNT(*) as count,
            MAX(created_at) as last_event_at
     FROM github_links
     GROUP BY repo
     ORDER BY count DESC, repo ASC`
  ).all() as RepoLinkCount[];
}
