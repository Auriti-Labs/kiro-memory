/**
 * Test suite per l'integrazione webhook GitHub.
 *
 * Strategia: testa le funzioni di database (GithubLinks CRUD)
 * e le funzioni pure estratte dal router (validateGithubSignature, extractIssueRefs)
 * su un database SQLite in-memory. Non avvia un server HTTP.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import crypto from 'crypto';
import { KiroMemoryDatabase } from '../../src/services/sqlite/Database.js';
import { createObservation } from '../../src/services/sqlite/Observations.js';
import {
  createGithubLink,
  getGithubLinksByObservation,
  getGithubLinksByRepo,
  getGithubLinksByIssue,
  getGithubLinksByPR,
  searchGithubLinks,
  listReposWithLinkCount,
} from '../../src/services/sqlite/GithubLinks.js';
import {
  validateGithubSignature,
  extractIssueRefs,
} from '../../src/services/routes/webhooks.js';
import type { Database } from 'bun:sqlite';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Genera una firma HMAC-SHA256 valida per il payload dato */
function signPayload(payload: string | Buffer, secret: string): string {
  const buf = typeof payload === 'string' ? Buffer.from(payload, 'utf-8') : payload;
  return 'sha256=' + crypto.createHmac('sha256', secret).update(buf).digest('hex');
}

/** Crea un link di test minimale */
function insertLink(
  db: Database,
  repo = 'org/repo',
  eventType = 'issues',
  overrides: Partial<Parameters<typeof createGithubLink>[1]> = {}
): number {
  return createGithubLink(db, {
    repo,
    event_type: eventType,
    action: 'opened',
    title: 'Test issue',
    issue_number: 42,
    ...overrides,
  });
}

/** Crea una observation reale nel DB e restituisce il suo ID */
function insertObservation(db: Database, project = 'test-proj'): number {
  return createObservation(
    db,
    'sess-webhook-test',
    project,
    'command',
    'Titolo observation test',
    null,
    'Contenuto test',
    null,
    null,
    null,
    null,
    null,
    1
  );
}

// ── Suite principale ──────────────────────────────────────────────────────────

describe('GitHub Webhooks Integration', () => {
  let kdb: KiroMemoryDatabase;
  let db: Database;

  beforeEach(() => {
    kdb = new KiroMemoryDatabase(':memory:');
    db = kdb.db;
  });

  afterEach(() => {
    kdb.close();
  });

  // ─── validateGithubSignature ─────────────────────────────────────────────

  describe('validateGithubSignature', () => {
    const secret = 'super-segreto-test';
    const payload = Buffer.from('{"action":"opened"}', 'utf-8');

    it('accetta una firma HMAC-SHA256 valida', () => {
      const signature = signPayload(payload, secret);
      expect(validateGithubSignature(payload, signature, secret)).toBe(true);
    });

    it('rifiuta una firma con secret sbagliato', () => {
      const signature = signPayload(payload, 'secret-errato');
      expect(validateGithubSignature(payload, signature, secret)).toBe(false);
    });

    it('rifiuta una firma malformata (senza prefisso sha256=)', () => {
      const rawHex = crypto.createHmac('sha256', secret).update(payload).digest('hex');
      expect(validateGithubSignature(payload, rawHex, secret)).toBe(false);
    });

    it('rifiuta quando la firma è undefined', () => {
      expect(validateGithubSignature(payload, undefined, secret)).toBe(false);
    });

    it('rifiuta una firma con payload modificato', () => {
      const alteredPayload = Buffer.from('{"action":"deleted"}', 'utf-8');
      const signature = signPayload(payload, secret);
      expect(validateGithubSignature(alteredPayload, signature, secret)).toBe(false);
    });

    it('rifiuta una stringa vuota come firma', () => {
      expect(validateGithubSignature(payload, '', secret)).toBe(false);
    });
  });

  // ─── extractIssueRefs ────────────────────────────────────────────────────

  describe('extractIssueRefs', () => {
    it('estrae un singolo riferimento a issue', () => {
      expect(extractIssueRefs('fix: risolto bug #42')).toEqual([42]);
    });

    it('estrae più riferimenti dal testo', () => {
      const refs = extractIssueRefs('closes #10, refs #20 and #30');
      expect(refs.sort((a, b) => a - b)).toEqual([10, 20, 30]);
    });

    it('deduplica riferimenti ripetuti', () => {
      expect(extractIssueRefs('#5 #5 #5')).toEqual([5]);
    });

    it('restituisce array vuoto quando non ci sono riferimenti', () => {
      expect(extractIssueRefs('commit senza riferimenti')).toEqual([]);
    });

    it('ignora numeri non preceduti da #', () => {
      expect(extractIssueRefs('versione 42 rilasciata')).toEqual([]);
    });

    it('gestisce stringa vuota', () => {
      expect(extractIssueRefs('')).toEqual([]);
    });
  });

  // ─── GithubLinks CRUD ────────────────────────────────────────────────────

  describe('createGithubLink', () => {
    it('inserisce un link e restituisce un ID positivo', () => {
      const id = insertLink(db);
      expect(typeof id).toBe('number');
      expect(id).toBeGreaterThan(0);
    });

    it('salva tutti i campi facoltativi correttamente', () => {
      // Crea prima una observation reale per soddisfare il vincolo di FK
      const obsId = insertObservation(db);
      const id = createGithubLink(db, {
        observation_id: obsId,
        session_id: 'sess-abc',
        repo: 'org/mio-repo',
        issue_number: 7,
        pr_number: null,
        event_type: 'issues',
        action: 'labeled',
        title: 'Titolo issue',
        url: 'https://github.com/org/mio-repo/issues/7',
        author: 'utente-test',
      });

      const row = db.query('SELECT * FROM github_links WHERE id = ?').get(id) as any;
      expect(row.observation_id).toBe(obsId);
      expect(row.session_id).toBe('sess-abc');
      expect(row.repo).toBe('org/mio-repo');
      expect(row.issue_number).toBe(7);
      expect(row.event_type).toBe('issues');
      expect(row.action).toBe('labeled');
      expect(row.title).toBe('Titolo issue');
      expect(row.author).toBe('utente-test');
    });

    it('salva campi facoltativi null senza errori', () => {
      const id = createGithubLink(db, {
        repo: 'org/repo',
        event_type: 'push',
      });
      expect(id).toBeGreaterThan(0);

      const row = db.query('SELECT * FROM github_links WHERE id = ?').get(id) as any;
      expect(row.observation_id).toBeNull();
      expect(row.issue_number).toBeNull();
      expect(row.pr_number).toBeNull();
    });
  });

  describe('getGithubLinksByObservation', () => {
    it('recupera i link per una observation specifica', () => {
      // Crea observations reali per soddisfare il vincolo di FK
      const obsId = insertObservation(db, 'proj-obs-test');
      const obsIdAltro = insertObservation(db, 'proj-obs-altro');
      insertLink(db, 'org/a', 'issues', { observation_id: obsId });
      insertLink(db, 'org/b', 'issues', { observation_id: obsId });
      insertLink(db, 'org/c', 'issues', { observation_id: obsIdAltro });

      const links = getGithubLinksByObservation(db, obsId);
      expect(links).toHaveLength(2);
      expect(links.every(l => l.observation_id === obsId)).toBe(true);
    });

    it('restituisce array vuoto per observation inesistente', () => {
      expect(getGithubLinksByObservation(db, 99999)).toHaveLength(0);
    });
  });

  describe('getGithubLinksByRepo', () => {
    it('filtra per repository', () => {
      insertLink(db, 'org/repo-a');
      insertLink(db, 'org/repo-a');
      insertLink(db, 'org/repo-b');

      const links = getGithubLinksByRepo(db, 'org/repo-a');
      expect(links).toHaveLength(2);
      expect(links.every(l => l.repo === 'org/repo-a')).toBe(true);
    });

    it('rispetta il limite', () => {
      for (let i = 0; i < 10; i++) {
        insertLink(db, 'org/big-repo');
      }
      const links = getGithubLinksByRepo(db, 'org/big-repo', 3);
      expect(links).toHaveLength(3);
    });

    it('restituisce array vuoto per repo inesistente', () => {
      expect(getGithubLinksByRepo(db, 'inesistente/repo')).toHaveLength(0);
    });
  });

  describe('getGithubLinksByIssue', () => {
    it('filtra per repo e numero issue', () => {
      insertLink(db, 'org/repo', 'issues', { issue_number: 5 });
      insertLink(db, 'org/repo', 'issues', { issue_number: 5 });
      insertLink(db, 'org/repo', 'issues', { issue_number: 99 });
      insertLink(db, 'altro/repo', 'issues', { issue_number: 5 });

      const links = getGithubLinksByIssue(db, 'org/repo', 5);
      expect(links).toHaveLength(2);
      expect(links.every(l => l.repo === 'org/repo' && l.issue_number === 5)).toBe(true);
    });

    it('gestisce evento push che referenzia una issue', () => {
      insertLink(db, 'org/repo', 'push', { issue_number: 10, pr_number: null });
      const links = getGithubLinksByIssue(db, 'org/repo', 10);
      expect(links).toHaveLength(1);
      expect(links[0].event_type).toBe('push');
    });
  });

  describe('getGithubLinksByPR', () => {
    it('filtra per repo e numero PR', () => {
      createGithubLink(db, {
        repo: 'org/repo',
        pr_number: 7,
        event_type: 'pull_request',
        action: 'opened',
      });
      createGithubLink(db, {
        repo: 'org/repo',
        pr_number: 8,
        event_type: 'pull_request',
        action: 'merged',
      });

      const links = getGithubLinksByPR(db, 'org/repo', 7);
      expect(links).toHaveLength(1);
      expect(links[0].pr_number).toBe(7);
    });
  });

  describe('searchGithubLinks', () => {
    beforeEach(() => {
      createGithubLink(db, {
        repo: 'org/repo',
        event_type: 'issues',
        action: 'opened',
        title: 'Fix crash nel parser',
        issue_number: 1,
      });
      createGithubLink(db, {
        repo: 'org/repo',
        event_type: 'pull_request',
        action: 'merged',
        title: 'Aggiungi supporto JSON',
        pr_number: 2,
      });
      createGithubLink(db, {
        repo: 'altro/progetto',
        event_type: 'push',
        action: 'push:main',
        title: 'chore: aggiorna dipendenze',
      });
    });

    it('cerca per keyword nel titolo', () => {
      const links = searchGithubLinks(db, 'parser');
      expect(links).toHaveLength(1);
      expect(links[0].title).toContain('parser');
    });

    it('filtra per repo', () => {
      const links = searchGithubLinks(db, '', { repo: 'org/repo' });
      expect(links).toHaveLength(2);
      expect(links.every(l => l.repo === 'org/repo')).toBe(true);
    });

    it('filtra per event_type', () => {
      const links = searchGithubLinks(db, '', { event_type: 'pull_request' });
      expect(links).toHaveLength(1);
      expect(links[0].event_type).toBe('pull_request');
    });

    it('combina keyword e filtro repo', () => {
      const links = searchGithubLinks(db, 'JSON', { repo: 'org/repo' });
      expect(links).toHaveLength(1);
      expect(links[0].title).toContain('JSON');
    });

    it('restituisce array vuoto per query senza corrispondenze', () => {
      const links = searchGithubLinks(db, 'zzznomatch');
      expect(links).toHaveLength(0);
    });

    it('rispetta il limite', () => {
      // Inserisce altri 5 link per superare il default
      for (let i = 0; i < 5; i++) {
        createGithubLink(db, { repo: 'org/repo', event_type: 'issues', title: `Issue extra ${i}` });
      }
      const links = searchGithubLinks(db, '', { limit: 2 });
      expect(links).toHaveLength(2);
    });
  });

  describe('listReposWithLinkCount', () => {
    it('restituisce i repo con conteggio corretto', () => {
      insertLink(db, 'org/repo-a');
      insertLink(db, 'org/repo-a');
      insertLink(db, 'org/repo-b');

      const repos = listReposWithLinkCount(db);
      expect(repos).toHaveLength(2);

      // Ordinati per conteggio decrescente
      expect(repos[0].repo).toBe('org/repo-a');
      expect(repos[0].count).toBe(2);
      expect(repos[1].repo).toBe('org/repo-b');
      expect(repos[1].count).toBe(1);
    });

    it('restituisce array vuoto se non ci sono link', () => {
      const repos = listReposWithLinkCount(db);
      expect(repos).toHaveLength(0);
    });

    it('include il campo last_event_at', () => {
      insertLink(db, 'org/repo');
      const repos = listReposWithLinkCount(db);
      expect(repos[0].last_event_at).toBeTruthy();
    });
  });

  // ─── Scenari evento webhook ───────────────────────────────────────────────

  describe('Scenario: evento issues aperto', () => {
    it('crea un link quando una issue viene aperta', () => {
      const id = createGithubLink(db, {
        repo: 'org/kiro-memory',
        issue_number: 18,
        event_type: 'issues',
        action: 'opened',
        title: 'GitHub webhooks integration',
        url: 'https://github.com/org/kiro-memory/issues/18',
        author: 'juan-camilo',
      });

      expect(id).toBeGreaterThan(0);

      const links = getGithubLinksByIssue(db, 'org/kiro-memory', 18);
      expect(links).toHaveLength(1);
      expect(links[0].action).toBe('opened');
      expect(links[0].author).toBe('juan-camilo');
    });
  });

  describe('Scenario: evento pull_request', () => {
    it('crea un link per apertura PR', () => {
      createGithubLink(db, {
        repo: 'org/kiro-memory',
        pr_number: 42,
        event_type: 'pull_request',
        action: 'opened',
        title: 'feat: aggiunge webhook support',
        author: 'contributor',
      });

      const links = getGithubLinksByPR(db, 'org/kiro-memory', 42);
      expect(links).toHaveLength(1);
      expect(links[0].action).toBe('opened');
    });

    it('crea un link con action merged per PR unita', () => {
      createGithubLink(db, {
        repo: 'org/kiro-memory',
        pr_number: 42,
        event_type: 'pull_request',
        action: 'merged',
        title: 'feat: aggiunge webhook support',
      });

      const links = getGithubLinksByPR(db, 'org/kiro-memory', 42);
      expect(links).toHaveLength(1);
      expect(links[0].action).toBe('merged');
    });
  });

  describe('Scenario: evento push con riferimenti issue', () => {
    it('crea un link per ogni riferimento #N trovato nel messaggio di commit', () => {
      // Simula ciò che processPushEvent fa: un commit che referenzia 2 issue
      const message = 'fix: risolto crash — closes #10, refs #20';
      const refs = extractIssueRefs(message);
      expect(refs.sort((a, b) => a - b)).toEqual([10, 20]);

      for (const issueNumber of refs) {
        createGithubLink(db, {
          repo: 'org/repo',
          issue_number: issueNumber,
          event_type: 'push',
          action: 'push:main',
          title: message.split('\n')[0].substring(0, 500),
          author: 'pusher',
        });
      }

      const linksIssue10 = getGithubLinksByIssue(db, 'org/repo', 10);
      const linksIssue20 = getGithubLinksByIssue(db, 'org/repo', 20);

      expect(linksIssue10).toHaveLength(1);
      expect(linksIssue10[0].event_type).toBe('push');

      expect(linksIssue20).toHaveLength(1);
      expect(linksIssue20[0].author).toBe('pusher');
    });

    it('non crea link per commit senza riferimenti', () => {
      const refs = extractIssueRefs('chore: aggiornamento dipendenze npm');
      expect(refs).toHaveLength(0);
      // Nessun link creato
      const links = getGithubLinksByRepo(db, 'org/repo');
      expect(links).toHaveLength(0);
    });
  });

  // ─── Ordinamento e tiebreaker ─────────────────────────────────────────────

  describe('Ordinamento con tiebreaker id DESC', () => {
    it('getGithubLinksByRepo ordina dal più recente e per ID decrescente', () => {
      // Inserisce più link nello stesso istante (epoch identico in test veloci)
      const id1 = insertLink(db, 'org/repo', 'issues', { issue_number: 1 });
      const id2 = insertLink(db, 'org/repo', 'issues', { issue_number: 2 });
      const id3 = insertLink(db, 'org/repo', 'issues', { issue_number: 3 });

      const links = getGithubLinksByRepo(db, 'org/repo', 10);
      // L'ordine dovrebbe essere id3, id2, id1 (tiebreaker id DESC)
      const ids = links.map(l => l.id);
      expect(ids[0]).toBeGreaterThanOrEqual(ids[1]);
      expect(ids[1]).toBeGreaterThanOrEqual(ids[2]);

      // Tutti e tre devono essere presenti
      expect(ids).toContain(id1);
      expect(ids).toContain(id2);
      expect(ids).toContain(id3);
    });
  });
});
