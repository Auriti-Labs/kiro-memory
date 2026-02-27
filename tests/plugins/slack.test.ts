/**
 * Test suite per il plugin Slack di Kiro Memory.
 *
 * Copertura:
 *   - Validazione configurazione (webhookUrl obbligatorio, https, eventi default)
 *   - Formattazione Block Kit (header, stats, summary, divider, context)
 *   - Rate limiting (max 1 messaggio per sessione)
 *   - Retry su HTTP 429 con exponential backoff
 *   - Gestione errori HTTP (4xx/5xx senza retry)
 *   - Errori di rete
 *   - Configurazione mancante
 *   - Lifecycle del plugin (init, destroy, hooks)
 *
 * Strategia: mock di fetch() per non fare chiamate HTTP reali.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  createSlackPlugin,
  validateConfig,
  sendWebhook,
  type SlackPluginConfig,
  type WebhookResult,
} from '../../src/plugins/slack/index.js';
import {
  buildSlackPayload,
  buildHeaderBlock,
  buildStatsBlock,
  buildSummaryBlock,
  buildDivider,
  buildContextBlock,
  truncateText,
  type SlackMessageData,
  type SlackPayload,
  type HeaderBlock,
  type SectionBlock,
  type DividerBlock,
  type ContextBlock,
} from '../../src/plugins/slack/formatter.js';
import type { PluginContext, PluginLogger } from '../../src/services/plugins/types.js';

// ── Helper: logger mock silenzioso ─────────────────────────────────────────────

function makeMockLogger(): PluginLogger {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
  };
}

// ── Helper: PluginContext mock ─────────────────────────────────────────────────

function makeContext(config: Record<string, unknown> = {}): PluginContext {
  return {
    sdk: {} as any,
    logger: makeMockLogger(),
    config,
  };
}

// ── Helper: mock fetch che risponde con successo ──────────────────────────────

function makeMockFetch(
  status: number = 200,
  body: string = 'ok',
  headers: Record<string, string> = {},
): typeof globalThis.fetch {
  return async (_url: string | URL | Request, _init?: RequestInit) => {
    return new Response(body, {
      status,
      headers: new Headers(headers),
    });
  };
}

// ── Helper: mock fetch che registra le chiamate ───────────────────────────────

interface FetchCall {
  url: string | URL | Request;
  init?: RequestInit;
}

function makeTrackingFetch(
  responses: Array<{ status: number; body?: string; headers?: Record<string, string> }>,
): { fetch: typeof globalThis.fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  let callIndex = 0;

  const fetchFn = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url, init });
    const resp = responses[Math.min(callIndex, responses.length - 1)];
    callIndex++;
    return new Response(resp.body ?? 'ok', {
      status: resp.status,
      headers: new Headers(resp.headers ?? {}),
    });
  };

  return { fetch: fetchFn, calls };
}

// ─────────────────────────────────────────────────────────────────────────────
// Validazione configurazione
// ─────────────────────────────────────────────────────────────────────────────

describe('validateConfig()', () => {
  it('accetta configurazione valida con tutti i campi', () => {
    const config = validateConfig({
      webhookUrl: 'https://hooks.slack.com/services/T00/B00/xxx',
      channel: '#kiro-alerts',
      events: ['onSessionEnd', 'onObservation'],
    });

    expect(config.webhookUrl).toBe('https://hooks.slack.com/services/T00/B00/xxx');
    expect(config.channel).toBe('#kiro-alerts');
    expect(config.events).toEqual(['onSessionEnd', 'onObservation']);
  });

  it('imposta eventi predefiniti a ["onSessionEnd"] se non specificati', () => {
    const config = validateConfig({
      webhookUrl: 'https://hooks.slack.com/services/T00/B00/xxx',
    });

    expect(config.events).toEqual(['onSessionEnd']);
  });

  it('lancia errore se webhookUrl manca', () => {
    expect(() => validateConfig({})).toThrow('webhookUrl');
  });

  it('lancia errore se webhookUrl è un numero', () => {
    expect(() => validateConfig({ webhookUrl: 12345 })).toThrow('webhookUrl');
  });

  it('lancia errore se webhookUrl non inizia con https://', () => {
    expect(() =>
      validateConfig({ webhookUrl: 'http://insecure.com/webhook' })
    ).toThrow('https://');
  });

  it('ignora channel se non è una stringa', () => {
    const config = validateConfig({
      webhookUrl: 'https://hooks.slack.com/services/T00/B00/xxx',
      channel: 42,
    });

    expect(config.channel).toBeUndefined();
  });

  it('filtra eventi non-stringa dall\'array events', () => {
    const config = validateConfig({
      webhookUrl: 'https://hooks.slack.com/services/T00/B00/xxx',
      events: ['onSessionEnd', 42, null, 'onObservation'],
    });

    expect(config.events).toEqual(['onSessionEnd', 'onObservation']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Formattazione Block Kit
// ─────────────────────────────────────────────────────────────────────────────

describe('Formatter Block Kit', () => {
  describe('truncateText()', () => {
    it('non tronca testo entro il limite', () => {
      expect(truncateText('breve', 100)).toBe('breve');
    });

    it('tronca testo oltre il limite aggiungendo "..."', () => {
      const result = truncateText('testo molto lungo', 10);
      expect(result).toBe('testo m...');
      expect(result.length).toBe(10);
    });

    it('gestisce testo esattamente al limite', () => {
      expect(truncateText('esatto', 6)).toBe('esatto');
    });
  });

  describe('buildHeaderBlock()', () => {
    it('crea un blocco header con il nome del progetto', () => {
      const block = buildHeaderBlock('kiro-memory');

      expect(block.type).toBe('header');
      expect(block.text.type).toBe('plain_text');
      expect(block.text.text).toContain('kiro-memory');
    });
  });

  describe('buildStatsBlock()', () => {
    it('crea un blocco sezione con progetto e sessione ID', () => {
      const data: SlackMessageData = {
        sessionId: 'abc-123-def',
        project: 'test-project',
        summary: null,
      };

      const block = buildStatsBlock(data);

      expect(block.type).toBe('section');
      expect(block.fields).toBeDefined();
      expect(block.fields!.length).toBe(2);
      expect(block.fields![0].text).toContain('test-project');
      expect(block.fields![1].text).toContain('abc-123-def');
    });
  });

  describe('buildSummaryBlock()', () => {
    it('mostra il sommario quando presente', () => {
      const block = buildSummaryBlock('Implementato il plugin Slack.');

      expect(block.type).toBe('section');
      expect(block.text.text).toContain('Implementato il plugin Slack.');
    });

    it('mostra messaggio di fallback quando il sommario è null', () => {
      const block = buildSummaryBlock(null);

      expect(block.text.text).toContain('Nessun sommario');
    });

    it('mostra messaggio di fallback quando il sommario è vuoto', () => {
      const block = buildSummaryBlock('   ');

      expect(block.text.text).toContain('Nessun sommario');
    });

    it('tronca sommari molto lunghi', () => {
      const longSummary = 'A'.repeat(3000);
      const block = buildSummaryBlock(longSummary);

      // Il testo nel blocco include il prefisso "*Sommario:*\n", quindi
      // il sommario troncato deve essere <= 2500 caratteri
      expect(block.text.text.length).toBeLessThanOrEqual(2500 + 20);
    });
  });

  describe('buildDivider()', () => {
    it('crea un blocco divider', () => {
      expect(buildDivider().type).toBe('divider');
    });
  });

  describe('buildContextBlock()', () => {
    it('crea un blocco contesto con timestamp', () => {
      const block = buildContextBlock();

      expect(block.type).toBe('context');
      expect(block.elements.length).toBe(1);
      expect(block.elements[0].text).toContain('Kiro Memory');
    });
  });

  describe('buildSlackPayload()', () => {
    it('genera un payload completo con 6 blocchi', () => {
      const data: SlackMessageData = {
        sessionId: 'sess-001',
        project: 'kiro-memory',
        summary: 'Sessione di debug completata.',
      };

      const payload = buildSlackPayload(data);

      expect(payload.blocks).toHaveLength(6);
      expect(payload.blocks[0].type).toBe('header');
      expect(payload.blocks[1].type).toBe('divider');
      expect(payload.blocks[2].type).toBe('section');
      expect(payload.blocks[3].type).toBe('section');
      expect(payload.blocks[4].type).toBe('divider');
      expect(payload.blocks[5].type).toBe('context');
    });

    it('include il testo di fallback con il sommario', () => {
      const payload = buildSlackPayload({
        sessionId: 'sess-002',
        project: 'test',
        summary: 'Tutto ok.',
      });

      expect(payload.text).toContain('test');
      expect(payload.text).toContain('Tutto ok.');
    });

    it('genera fallback senza sommario se null', () => {
      const payload = buildSlackPayload({
        sessionId: 'sess-003',
        project: 'test',
        summary: null,
      });

      expect(payload.text).toContain('test');
      expect(payload.text).toContain('completata');
    });

    it('include il canale se specificato', () => {
      const payload = buildSlackPayload({
        sessionId: 'sess-004',
        project: 'test',
        summary: null,
        channel: '#notifiche',
      });

      expect(payload.channel).toBe('#notifiche');
    });

    it('non include il canale se non specificato', () => {
      const payload = buildSlackPayload({
        sessionId: 'sess-005',
        project: 'test',
        summary: null,
      });

      expect(payload.channel).toBeUndefined();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// sendWebhook — invio con retry
// ─────────────────────────────────────────────────────────────────────────────

describe('sendWebhook()', () => {
  const webhookUrl = 'https://hooks.slack.com/services/T00/B00/xxx';
  const payload = { text: 'test' };
  const logger = makeMockLogger();

  it('ritorna successo su HTTP 200', async () => {
    const result = await sendWebhook(
      webhookUrl,
      payload,
      logger,
      makeMockFetch(200),
    );

    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.retries).toBe(0);
  });

  it('invia il payload come JSON con Content-Type corretto', async () => {
    const { fetch: mockFetch, calls } = makeTrackingFetch([{ status: 200 }]);

    await sendWebhook(webhookUrl, payload, logger, mockFetch);

    expect(calls).toHaveLength(1);
    const headers = (calls[0].init?.headers as Record<string, string>);
    expect(headers['Content-Type']).toBe('application/json');
    expect(calls[0].init?.body).toBe(JSON.stringify(payload));
  });

  it('ritorna errore su HTTP 400 senza retry', async () => {
    const result = await sendWebhook(
      webhookUrl,
      payload,
      logger,
      makeMockFetch(400, 'Bad Request'),
    );

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(400);
    expect(result.retries).toBe(0);
    expect(result.error).toContain('400');
  });

  it('ritorna errore su HTTP 500 senza retry', async () => {
    const result = await sendWebhook(
      webhookUrl,
      payload,
      logger,
      makeMockFetch(500, 'Internal Server Error'),
    );

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(500);
    expect(result.retries).toBe(0);
  });

  it('gestisce errori di rete (fetch lancia eccezione)', async () => {
    const failingFetch = async () => {
      throw new Error('Network unreachable');
    };

    const result = await sendWebhook(
      webhookUrl,
      payload,
      logger,
      failingFetch as any,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Network unreachable');
  });

  // ── Test retry su 429 ──────────────────────────────────────────────────────

  it('ritenta su HTTP 429 e riesce al secondo tentativo', async () => {
    const { fetch: mockFetch, calls } = makeTrackingFetch([
      { status: 429, headers: { 'Retry-After': '0' } }, // Primo tentativo: rate limited (delay 0)
      { status: 200 }, // Secondo tentativo: successo
    ]);

    const result = await sendWebhook(webhookUrl, payload, logger, mockFetch);

    expect(result.success).toBe(true);
    expect(result.retries).toBe(1);
    expect(calls).toHaveLength(2);
  });

  it('rinuncia dopo MAX_RETRIES su 429 continui', async () => {
    // 1 tentativo iniziale + 3 retry = 4 chiamate, tutte 429
    const { fetch: mockFetch, calls } = makeTrackingFetch([
      { status: 429, headers: { 'Retry-After': '0' } },
      { status: 429, headers: { 'Retry-After': '0' } },
      { status: 429, headers: { 'Retry-After': '0' } },
      { status: 429, headers: { 'Retry-After': '0' } },
    ]);

    const result = await sendWebhook(webhookUrl, payload, logger, mockFetch);

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(429);
    expect(result.error).toContain('Rate limited');
    // 1 tentativo iniziale + MAX_RETRIES (3) = 4 chiamate
    expect(calls).toHaveLength(4);
  }, 15_000); // Timeout esteso per i retry
});

// ─────────────────────────────────────────────────────────────────────────────
// Plugin Slack — lifecycle completo
// ─────────────────────────────────────────────────────────────────────────────

describe('Plugin Slack (createSlackPlugin)', () => {
  // ── Metadata ────────────────────────────────────────────────────────────────

  it('ha nome, versione e descrizione corretti', () => {
    const plugin = createSlackPlugin();

    expect(plugin.name).toBe('kiro-memory-plugin-slack');
    expect(plugin.version).toBe('1.0.0');
    expect(plugin.description).toBeDefined();
  });

  // ── Init ────────────────────────────────────────────────────────────────────

  it('init() con configurazione valida non lancia', async () => {
    const plugin = createSlackPlugin();

    await expect(
      plugin.init(makeContext({
        webhookUrl: 'https://hooks.slack.com/services/T00/B00/xxx',
      }))
    ).resolves.toBeUndefined();
  });

  it('init() lancia se webhookUrl manca', async () => {
    const plugin = createSlackPlugin();

    await expect(
      plugin.init(makeContext({}))
    ).rejects.toThrow('webhookUrl');
  });

  it('init() lancia se webhookUrl non è https', async () => {
    const plugin = createSlackPlugin();

    await expect(
      plugin.init(makeContext({ webhookUrl: 'http://insecure.example.com' }))
    ).rejects.toThrow('https://');
  });

  // ── Destroy ─────────────────────────────────────────────────────────────────

  it('destroy() non lancia e pulisce lo stato', async () => {
    const plugin = createSlackPlugin();

    await plugin.init(makeContext({
      webhookUrl: 'https://hooks.slack.com/services/T00/B00/xxx',
    }));

    await expect(plugin.destroy()).resolves.toBeUndefined();
  });

  // ── Hooks ───────────────────────────────────────────────────────────────────

  it('espone l\'hook onSessionEnd', () => {
    const plugin = createSlackPlugin();

    expect(plugin.hooks).toBeDefined();
    expect(plugin.hooks?.onSessionEnd).toBeDefined();
    expect(typeof plugin.hooks?.onSessionEnd).toBe('function');
  });

  it('non espone hook non dichiarati (onObservation, ecc.)', () => {
    const plugin = createSlackPlugin();

    expect(plugin.hooks?.onObservation).toBeUndefined();
    expect(plugin.hooks?.onSummary).toBeUndefined();
    expect(plugin.hooks?.onSessionStart).toBeUndefined();
  });

  // ── Rate limiting ───────────────────────────────────────────────────────────

  describe('rate limiting', () => {
    it('non invia notifica se il plugin non è inizializzato', async () => {
      const plugin = createSlackPlugin();
      // Chiamiamo l'hook senza init() — non deve lanciare
      await expect(
        plugin.hooks!.onSessionEnd!({
          id: 'sess-no-init',
          project: 'test',
          summary: 'sommario',
        })
      ).resolves.toBeUndefined();
    });

    it('non invia la stessa sessione due volte (rate limiting)', async () => {
      // Per testare il rate limiting, creiamo un plugin che usa un fetch mock
      // L'approccio è: inizializziamo il plugin, poi chiamiamo onSessionEnd due volte
      // La seconda chiamata deve essere un no-op

      let fetchCallCount = 0;
      const originalFetch = globalThis.fetch;

      // Sovrascriviamo fetch globale per il test
      globalThis.fetch = async () => {
        fetchCallCount++;
        return new Response('ok', { status: 200 });
      };

      try {
        const plugin = createSlackPlugin();
        await plugin.init(makeContext({
          webhookUrl: 'https://hooks.slack.com/services/T00/B00/xxx',
          events: ['onSessionEnd'],
        }));

        const session = { id: 'sess-dedup', project: 'test', summary: 'Completato.' };

        // Prima chiamata: deve inviare
        await plugin.hooks!.onSessionEnd!(session);
        expect(fetchCallCount).toBe(1);

        // Seconda chiamata: stessa sessione, deve essere un no-op
        await plugin.hooks!.onSessionEnd!(session);
        expect(fetchCallCount).toBe(1); // Non deve essere incrementato
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('invia notifiche per sessioni diverse', async () => {
      let fetchCallCount = 0;
      const originalFetch = globalThis.fetch;

      globalThis.fetch = async () => {
        fetchCallCount++;
        return new Response('ok', { status: 200 });
      };

      try {
        const plugin = createSlackPlugin();
        await plugin.init(makeContext({
          webhookUrl: 'https://hooks.slack.com/services/T00/B00/xxx',
          events: ['onSessionEnd'],
        }));

        await plugin.hooks!.onSessionEnd!({ id: 'sess-1', project: 'test', summary: 'Primo' });
        await plugin.hooks!.onSessionEnd!({ id: 'sess-2', project: 'test', summary: 'Secondo' });

        expect(fetchCallCount).toBe(2);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('destroy() resetta il rate limiting', async () => {
      let fetchCallCount = 0;
      const originalFetch = globalThis.fetch;

      globalThis.fetch = async () => {
        fetchCallCount++;
        return new Response('ok', { status: 200 });
      };

      try {
        const plugin = createSlackPlugin();
        await plugin.init(makeContext({
          webhookUrl: 'https://hooks.slack.com/services/T00/B00/xxx',
          events: ['onSessionEnd'],
        }));

        const session = { id: 'sess-reset', project: 'test', summary: 'Test' };

        await plugin.hooks!.onSessionEnd!(session);
        expect(fetchCallCount).toBe(1);

        // Distruggi e reinizializza
        await plugin.destroy();
        await plugin.init(makeContext({
          webhookUrl: 'https://hooks.slack.com/services/T00/B00/xxx',
          events: ['onSessionEnd'],
        }));

        // Stessa sessione ma dopo destroy/init: deve reinviare
        await plugin.hooks!.onSessionEnd!(session);
        expect(fetchCallCount).toBe(2);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  // ── Filtro eventi ──────────────────────────────────────────────────────────

  describe('filtro eventi', () => {
    it('non invia se onSessionEnd non è tra gli eventi configurati', async () => {
      let fetchCallCount = 0;
      const originalFetch = globalThis.fetch;

      globalThis.fetch = async () => {
        fetchCallCount++;
        return new Response('ok', { status: 200 });
      };

      try {
        const plugin = createSlackPlugin();
        await plugin.init(makeContext({
          webhookUrl: 'https://hooks.slack.com/services/T00/B00/xxx',
          events: ['onObservation'], // Solo onObservation, non onSessionEnd
        }));

        await plugin.hooks!.onSessionEnd!({
          id: 'sess-no-event',
          project: 'test',
          summary: 'Non deve arrivare',
        });

        expect(fetchCallCount).toBe(0);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
