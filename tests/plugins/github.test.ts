/**
 * Test suite per il plugin GitHub di Kiro Memory.
 *
 * Copre:
 *   - Parsing issue references (#123, owner/repo#123, closes #123, etc.)
 *   - Deduplicazione dei riferimenti
 *   - Auto-linking onObservation (traccia issue durante la sessione)
 *   - Commento automatico a fine sessione (onSessionEnd)
 *   - Rate limiting e cache del client
 *   - Configurazione mancante o invalida
 *
 * Usa mock di fetch() per evitare chiamate reali alle API GitHub.
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { parseIssueReferences, type IssueReference } from '../../src/plugins/github/issue-parser.js';
import { GitHubClient, type GitHubClientConfig } from '../../src/plugins/github/github-client.js';
import { GitHubPlugin } from '../../src/plugins/github/index.js';
import type { PluginContext, PluginLogger } from '../../src/services/plugins/types.js';

// ── Helper: logger finto per i test ──────────────────────────────────────────

function makeMockLogger(): PluginLogger {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
  };
}

// ── Helper: contesto finto per i test ────────────────────────────────────────

function makeContext(config: Record<string, unknown> = {}): PluginContext {
  return {
    sdk: {} as any,
    logger: makeMockLogger(),
    config,
  };
}

// ── Helper: mock di fetch con risposte configurabili ─────────────────────────

function mockFetch(responses: Array<{
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}>) {
  let callIndex = 0;

  const mockFn = mock(async (_url: string, _init?: RequestInit) => {
    const resp = responses[Math.min(callIndex++, responses.length - 1)];
    const headers = new Headers();
    // Header di default (possono essere sovrascritti dai custom)
    headers.set('x-ratelimit-remaining', '4999');
    headers.set('x-ratelimit-reset', String(Math.floor(Date.now() / 1000) + 3600));
    // Applica header custom (sovrascrivono i default)
    if (resp.headers) {
      for (const [k, v] of Object.entries(resp.headers)) {
        headers.set(k, v);
      }
    }

    return new Response(JSON.stringify(resp.body), {
      status: resp.status,
      headers,
    });
  });

  // Sostituisci fetch globale
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFn as any;

  return {
    mockFn,
    restore: () => { globalThis.fetch = originalFetch; },
    callCount: () => callIndex,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Test: Issue Parser
// ═════════════════════════════════════════════════════════════════════════════

describe('parseIssueReferences', () => {
  it('estrae #N standalone', () => {
    const refs = parseIssueReferences('Lavoro su #42 completato');
    expect(refs).toHaveLength(1);
    expect(refs[0].number).toBe(42);
    expect(refs[0].owner).toBeUndefined();
    expect(refs[0].repo).toBeUndefined();
    expect(refs[0].keyword).toBeUndefined();
  });

  it('estrae #N a inizio riga', () => {
    const refs = parseIssueReferences('#123 implementato');
    expect(refs).toHaveLength(1);
    expect(refs[0].number).toBe(123);
  });

  it('estrae owner/repo#N', () => {
    const refs = parseIssueReferences('Vedi Auriti-Labs/kiro-memory#32');
    expect(refs).toHaveLength(1);
    expect(refs[0].number).toBe(32);
    expect(refs[0].owner).toBe('Auriti-Labs');
    expect(refs[0].repo).toBe('kiro-memory');
  });

  it('estrae closes #N con keyword', () => {
    const refs = parseIssueReferences('closes #7 con questa modifica');
    expect(refs).toHaveLength(1);
    expect(refs[0].number).toBe(7);
    expect(refs[0].keyword).toBe('closes');
  });

  it('estrae fixes owner/repo#N con keyword', () => {
    const refs = parseIssueReferences('fixes Auriti-Labs/kiro-memory#99');
    expect(refs).toHaveLength(1);
    expect(refs[0].number).toBe(99);
    expect(refs[0].keyword).toBe('fixes');
    expect(refs[0].owner).toBe('Auriti-Labs');
    expect(refs[0].repo).toBe('kiro-memory');
  });

  it('estrae resolves #N', () => {
    const refs = parseIssueReferences('Questa modifica resolves #15');
    expect(refs).toHaveLength(1);
    expect(refs[0].number).toBe(15);
    expect(refs[0].keyword).toBe('resolves');
  });

  it('estrae fix #N (forma breve)', () => {
    const refs = parseIssueReferences('fix #8 - bug transaction');
    expect(refs).toHaveLength(1);
    expect(refs[0].number).toBe(8);
    expect(refs[0].keyword).toBe('fix');
  });

  it('estrae riferimenti multipli nella stessa stringa', () => {
    const refs = parseIssueReferences('Lavoro su #1, #2 e #3');
    expect(refs).toHaveLength(3);

    const numbers = refs.map(r => r.number).sort((a, b) => a - b);
    expect(numbers).toEqual([1, 2, 3]);
  });

  it('deduplica lo stesso numero issue', () => {
    const refs = parseIssueReferences('#42 e poi di nuovo #42');
    expect(refs).toHaveLength(1);
    expect(refs[0].number).toBe(42);
  });

  it('preferisce la versione con keyword in caso di duplicato', () => {
    const refs = parseIssueReferences('Vedi #10, poi closes #10');
    expect(refs).toHaveLength(1);
    expect(refs[0].number).toBe(10);
    expect(refs[0].keyword).toBe('closes');
  });

  it('preferisce owner/repo#N rispetto a #N standalone', () => {
    const refs = parseIssueReferences('Auriti-Labs/kiro-memory#5 è la stessa issue');
    // Il full ref dovrebbe sovrascrivere lo standalone se il numero è lo stesso
    const ref5 = refs.find(r => r.number === 5);
    expect(ref5).toBeDefined();
    expect(ref5!.owner).toBe('Auriti-Labs');
  });

  it('restituisce array vuoto per stringa vuota', () => {
    expect(parseIssueReferences('')).toEqual([]);
  });

  it('restituisce array vuoto per input nullo', () => {
    expect(parseIssueReferences(null as any)).toEqual([]);
    expect(parseIssueReferences(undefined as any)).toEqual([]);
  });

  it('ignora numeri non preceduti da #', () => {
    const refs = parseIssueReferences('La versione 123 è disponibile');
    expect(refs).toHaveLength(0);
  });

  it('gestisce closed (passato) come keyword', () => {
    const refs = parseIssueReferences('closed #44 nel commit');
    expect(refs).toHaveLength(1);
    expect(refs[0].keyword).toBe('closed');
  });

  it('gestisce fixed (passato) come keyword', () => {
    const refs = parseIssueReferences('fixed #55 con patch');
    expect(refs).toHaveLength(1);
    expect(refs[0].keyword).toBe('fixed');
  });

  it('gestisce resolved (passato) come keyword', () => {
    const refs = parseIssueReferences('resolved #66');
    expect(refs).toHaveLength(1);
    expect(refs[0].keyword).toBe('resolved');
  });

  it('gestisce #N dopo parentesi aperta', () => {
    const refs = parseIssueReferences('Bug critico (#8) risolto');
    expect(refs).toHaveLength(1);
    expect(refs[0].number).toBe(8);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Test: GitHub Client
// ═════════════════════════════════════════════════════════════════════════════

describe('GitHubClient', () => {
  let fetchMock: ReturnType<typeof mockFetch>;

  afterEach(() => {
    fetchMock?.restore();
  });

  it('getIssue restituisce i dati della issue', async () => {
    const issueData = {
      number: 32,
      title: 'Plugin GitHub',
      state: 'open',
      html_url: 'https://github.com/Auriti-Labs/kiro-memory/issues/32',
      labels: [{ name: 'enhancement' }],
    };

    fetchMock = mockFetch([{ status: 200, body: issueData }]);

    const client = new GitHubClient({ token: 'test-token' }, makeMockLogger());
    const issue = await client.getIssue('Auriti-Labs', 'kiro-memory', 32);

    expect(issue.number).toBe(32);
    expect(issue.title).toBe('Plugin GitHub');
    expect(issue.state).toBe('open');
  });

  it('getIssue usa la cache al secondo accesso', async () => {
    const issueData = {
      number: 1,
      title: 'Cached',
      state: 'open',
      html_url: 'https://github.com/test/repo/issues/1',
      labels: [],
    };

    fetchMock = mockFetch([{ status: 200, body: issueData }]);

    const client = new GitHubClient({ token: 'test-token' }, makeMockLogger());

    // Prima chiamata: fetch reale
    const first = await client.getIssue('test', 'repo', 1);
    expect(first.title).toBe('Cached');

    // Seconda chiamata: dalla cache (fetch non viene chiamato di nuovo)
    const second = await client.getIssue('test', 'repo', 1);
    expect(second.title).toBe('Cached');

    // Verifica che fetch sia stato chiamato solo una volta
    expect(fetchMock.callCount()).toBe(1);
  });

  it('clearCache svuota la cache', async () => {
    const issueData = {
      number: 2,
      title: 'CacheClear',
      state: 'open',
      html_url: 'url',
      labels: [],
    };

    fetchMock = mockFetch([
      { status: 200, body: issueData },
      { status: 200, body: { ...issueData, title: 'Updated' } },
    ]);

    const client = new GitHubClient({ token: 'test-token' }, makeMockLogger());

    await client.getIssue('test', 'repo', 2);
    client.clearCache();
    const after = await client.getIssue('test', 'repo', 2);

    // Dopo clearCache, fetch viene chiamato di nuovo
    expect(fetchMock.callCount()).toBe(2);
    expect(after.title).toBe('Updated');
  });

  it('addComment invia il commento correttamente', async () => {
    const commentData = {
      id: 999,
      body: 'Test comment',
      html_url: 'https://github.com/test/repo/issues/1#issuecomment-999',
    };

    fetchMock = mockFetch([{ status: 201, body: commentData }]);

    const client = new GitHubClient({ token: 'test-token' }, makeMockLogger());
    const comment = await client.addComment('test', 'repo', 1, 'Test comment');

    expect(comment.id).toBe(999);
    expect(comment.body).toBe('Test comment');
  });

  it('lancia errore per 404 (issue non trovata)', async () => {
    fetchMock = mockFetch([{ status: 404, body: { message: 'Not Found' } }]);

    const client = new GitHubClient({ token: 'test-token' }, makeMockLogger());

    await expect(client.getIssue('test', 'repo', 999)).rejects.toThrow(/non trovata/);
  });

  it('lancia errore per 401 (token invalido)', async () => {
    fetchMock = mockFetch([{ status: 401, body: { message: 'Bad credentials' } }]);

    const client = new GitHubClient({ token: 'bad-token' }, makeMockLogger());

    await expect(client.getIssue('test', 'repo', 1)).rejects.toThrow(/non valido/);
  });

  it('aggiorna le informazioni di rate limit', async () => {
    fetchMock = mockFetch([{
      status: 200,
      body: { number: 1, title: 'Test', state: 'open', html_url: 'url', labels: [] },
      headers: {
        'x-ratelimit-remaining': '4500',
        'x-ratelimit-reset': '1700000000',
      },
    }]);

    const client = new GitHubClient({ token: 'test-token' }, makeMockLogger());
    await client.getIssue('test', 'repo', 1);

    const rateLimit = client.getRateLimit();
    expect(rateLimit.remaining).toBe(4500);
    expect(rateLimit.resetAt).toBe(1700000000);
  });

  it('supporta baseUrl personalizzato per GitHub Enterprise', async () => {
    fetchMock = mockFetch([{
      status: 200,
      body: { number: 1, title: 'GHE', state: 'open', html_url: 'url', labels: [] },
    }]);

    const client = new GitHubClient({
      token: 'test-token',
      baseUrl: 'https://github.mycompany.com/api/v3',
    }, makeMockLogger());

    await client.getIssue('team', 'project', 1);

    // Verifica che la URL contenga il baseUrl personalizzato
    const callArgs = (fetchMock.mockFn as any).mock.calls[0];
    expect(callArgs[0]).toContain('github.mycompany.com');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Test: GitHubPlugin (integrazione hooks)
// ═════════════════════════════════════════════════════════════════════════════

describe('GitHubPlugin', () => {
  let plugin: GitHubPlugin;
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    plugin = new GitHubPlugin();
  });

  afterEach(async () => {
    try {
      await plugin.destroy();
    } catch { /* ignora se già distrutto */ }
    fetchMock?.restore();
  });

  // ── Inizializzazione ────────────────────────────────────────────────────

  describe('init()', () => {
    it('inizializza con configurazione valida', async () => {
      const ctx = makeContext({ token: 'ghp_test123', repo: 'Auriti-Labs/kiro-memory' });
      await plugin.init(ctx);

      expect(plugin._getClient()).not.toBeNull();
    });

    it('lancia errore se token mancante', async () => {
      const ctx = makeContext({});
      await expect(plugin.init(ctx)).rejects.toThrow(/token.*obbligatorio/i);
    });

    it('lancia errore se token è stringa vuota', async () => {
      const ctx = makeContext({ token: '' });
      await expect(plugin.init(ctx)).rejects.toThrow(/token.*obbligatorio/i);
    });

    it('funziona senza repo default', async () => {
      const ctx = makeContext({ token: 'ghp_test123' });
      await plugin.init(ctx);

      expect(plugin._getClient()).not.toBeNull();
    });
  });

  // ── Hook: onObservation ────────────────────────────────────────────────

  describe('onObservation', () => {
    it('traccia issue reference nel titolo', async () => {
      const ctx = makeContext({ token: 'ghp_test', repo: 'Auriti-Labs/kiro-memory' });
      await plugin.init(ctx);

      await plugin.hooks.onObservation!({
        id: 1,
        project: 'kiro-memory',
        type: 'file-write',
        title: 'Implementato fix per #32',
      });

      const linked = plugin._getLinkedIssues();
      expect(linked.size).toBe(1);
      expect(linked.has('Auriti-Labs/kiro-memory#32')).toBe(true);
    });

    it('traccia issue multiple nel titolo', async () => {
      const ctx = makeContext({ token: 'ghp_test', repo: 'owner/repo' });
      await plugin.init(ctx);

      await plugin.hooks.onObservation!({
        id: 2,
        project: 'test',
        type: 'command',
        title: 'Lavoro su #1 e #2',
      });

      const linked = plugin._getLinkedIssues();
      expect(linked.size).toBe(2);
    });

    it('accumula osservazioni multiple per la stessa issue', async () => {
      const ctx = makeContext({ token: 'ghp_test', repo: 'owner/repo' });
      await plugin.init(ctx);

      await plugin.hooks.onObservation!({
        id: 1,
        project: 'test',
        type: 'file-write',
        title: 'Prima modifica per #5',
      });

      await plugin.hooks.onObservation!({
        id: 2,
        project: 'test',
        type: 'file-write',
        title: 'Seconda modifica per #5',
      });

      const linked = plugin._getLinkedIssues();
      expect(linked.size).toBe(1);

      const issue5 = linked.get('owner/repo#5');
      expect(issue5?.observationTitles).toHaveLength(2);
    });

    it('usa owner/repo dal reference se specificato', async () => {
      const ctx = makeContext({ token: 'ghp_test', repo: 'default/repo' });
      await plugin.init(ctx);

      await plugin.hooks.onObservation!({
        id: 1,
        project: 'test',
        type: 'command',
        title: 'Vedi other-owner/other-repo#99',
      });

      const linked = plugin._getLinkedIssues();
      expect(linked.has('other-owner/other-repo#99')).toBe(true);
    });

    it('ignora osservazioni senza riferimenti issue', async () => {
      const ctx = makeContext({ token: 'ghp_test', repo: 'owner/repo' });
      await plugin.init(ctx);

      await plugin.hooks.onObservation!({
        id: 3,
        project: 'test',
        type: 'file-write',
        title: 'Modifica senza issue',
      });

      expect(plugin._getLinkedIssues().size).toBe(0);
    });

    it('ignora issue senza repo configurato', async () => {
      // Nessun repo default nella config
      const ctx = makeContext({ token: 'ghp_test' });
      await plugin.init(ctx);

      await plugin.hooks.onObservation!({
        id: 1,
        project: 'test',
        type: 'file-write',
        title: 'Lavoro su #42', // #42 standalone senza repo
      });

      // Non può risolvere owner/repo, quindi non traccia
      expect(plugin._getLinkedIssues().size).toBe(0);
    });
  });

  // ── Hook: onSessionEnd ────────────────────────────────────────────────

  describe('onSessionEnd', () => {
    it('commenta sulle issue linkate a fine sessione', async () => {
      const commentResponse = {
        id: 100,
        body: 'commento',
        html_url: 'https://github.com/owner/repo/issues/5#issuecomment-100',
      };

      fetchMock = mockFetch([{ status: 201, body: commentResponse }]);

      const ctx = makeContext({ token: 'ghp_test', repo: 'owner/repo' });
      await plugin.init(ctx);

      // Simula un'osservazione che linka una issue
      await plugin.hooks.onObservation!({
        id: 1,
        project: 'test',
        type: 'file-write',
        title: 'Implementato closes #5',
      });

      // Fine sessione con summary
      await plugin.hooks.onSessionEnd!({
        id: 'sess-123',
        project: 'test',
        summary: 'Implementata la feature richiesta.',
      });

      // Verifica che il commento sia stato postato
      expect(fetchMock.callCount()).toBe(1);
    });

    it('non commenta se autoComment è disabilitato', async () => {
      fetchMock = mockFetch([]);

      const ctx = makeContext({
        token: 'ghp_test',
        repo: 'owner/repo',
        autoComment: false,
      });
      await plugin.init(ctx);

      await plugin.hooks.onObservation!({
        id: 1,
        project: 'test',
        type: 'file-write',
        title: 'Lavoro su #10',
      });

      await plugin.hooks.onSessionEnd!({
        id: 'sess-456',
        project: 'test',
        summary: 'Fatto.',
      });

      // Nessuna chiamata fetch
      expect(fetchMock.callCount()).toBe(0);
    });

    it('non commenta se non ci sono issue linkate', async () => {
      fetchMock = mockFetch([]);

      const ctx = makeContext({ token: 'ghp_test', repo: 'owner/repo' });
      await plugin.init(ctx);

      await plugin.hooks.onSessionEnd!({
        id: 'sess-789',
        project: 'test',
        summary: 'Sessione senza issue.',
      });

      expect(fetchMock.callCount()).toBe(0);
    });

    it('non commenta se il summary è nullo', async () => {
      fetchMock = mockFetch([]);

      const ctx = makeContext({ token: 'ghp_test', repo: 'owner/repo' });
      await plugin.init(ctx);

      await plugin.hooks.onObservation!({
        id: 1,
        project: 'test',
        type: 'file-write',
        title: 'Lavoro su #7',
      });

      await plugin.hooks.onSessionEnd!({
        id: 'sess-000',
        project: 'test',
        summary: null,
      });

      expect(fetchMock.callCount()).toBe(0);
    });

    it('pulisce le issue linkate dopo la fine sessione', async () => {
      const commentResponse = {
        id: 200,
        body: 'ok',
        html_url: 'url',
      };

      fetchMock = mockFetch([{ status: 201, body: commentResponse }]);

      const ctx = makeContext({ token: 'ghp_test', repo: 'owner/repo' });
      await plugin.init(ctx);

      await plugin.hooks.onObservation!({
        id: 1,
        project: 'test',
        type: 'file-write',
        title: 'Lavoro su #3',
      });

      await plugin.hooks.onSessionEnd!({
        id: 'sess-cleanup',
        project: 'test',
        summary: 'Done.',
      });

      // Dopo la fine sessione, le issue linkate devono essere svuotate
      expect(plugin._getLinkedIssues().size).toBe(0);
    });

    it('gestisce errori nel commento senza crashare', async () => {
      // Uso 404 perché non fa retry (a differenza di 500 che causa backoff)
      fetchMock = mockFetch([{ status: 404, body: { message: 'Not Found' } }]);

      const ctx = makeContext({ token: 'ghp_test', repo: 'owner/repo' });
      await plugin.init(ctx);

      await plugin.hooks.onObservation!({
        id: 1,
        project: 'test',
        type: 'file-write',
        title: 'Lavoro su #99',
      });

      // Non deve lanciare eccezioni anche se il commento fallisce
      await expect(plugin.hooks.onSessionEnd!({
        id: 'sess-err',
        project: 'test',
        summary: 'Sessione con errore.',
      })).resolves.toBeUndefined();
    });
  });

  // ── Proprietà IPlugin ──────────────────────────────────────────────────

  describe('proprietà IPlugin', () => {
    it('ha nome corretto', () => {
      expect(plugin.name).toBe('kiro-memory-plugin-github');
    });

    it('ha versione semver', () => {
      expect(plugin.version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('ha descrizione', () => {
      expect(plugin.description).toBeTruthy();
    });

    it('ha hooks definiti', () => {
      expect(plugin.hooks).toBeDefined();
      expect(plugin.hooks!.onObservation).toBeInstanceOf(Function);
      expect(plugin.hooks!.onSessionEnd).toBeInstanceOf(Function);
    });

    it('ha init e destroy come funzioni', () => {
      expect(plugin.init).toBeInstanceOf(Function);
      expect(plugin.destroy).toBeInstanceOf(Function);
    });
  });

  // ── destroy() ──────────────────────────────────────────────────────────

  describe('destroy()', () => {
    it('pulisce tutte le risorse', async () => {
      const ctx = makeContext({ token: 'ghp_test', repo: 'owner/repo' });
      await plugin.init(ctx);

      // Aggiungi qualche issue linkata
      await plugin.hooks.onObservation!({
        id: 1,
        project: 'test',
        type: 'file-write',
        title: 'Fix #1',
      });

      expect(plugin._getLinkedIssues().size).toBe(1);
      expect(plugin._getClient()).not.toBeNull();

      await plugin.destroy();

      expect(plugin._getLinkedIssues().size).toBe(0);
      expect(plugin._getClient()).toBeNull();
    });
  });
});
