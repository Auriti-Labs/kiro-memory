/**
 * Test suite per il SDK TotalRecall
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { TotalRecallSDK, createTotalRecall } from '../../src/sdk/index.js';

describe('TotalRecall SDK', () => {
  let sdk: TotalRecallSDK;

  beforeEach(() => {
    // Usa DB in-memory per i test, project esplicito
    sdk = createTotalRecall({ dataDir: ':memory:', project: 'test-project' });
  });

  afterEach(() => {
    sdk.close();
  });

  describe('storeObservation', () => {
    it('dovrebbe salvare un\'osservazione e tornare un ID', async () => {
      const id = await sdk.storeObservation({
        type: 'bug-fix',
        title: 'Fix login',
        content: 'Risolto problema di autenticazione'
      });

      expect(typeof id).toBe('number');
      expect(id).toBeGreaterThan(0);
    });

    it('dovrebbe salvare osservazione con concepts e files', async () => {
      const id = await sdk.storeObservation({
        type: 'feature',
        title: 'Nuova feature',
        content: 'Aggiunta pagina settings',
        concepts: ['react', 'typescript'],
        files: ['src/settings.tsx']
      });

      expect(id).toBeGreaterThan(0);
    });
  });

  describe('storeSummary', () => {
    it('dovrebbe salvare un sommario', async () => {
      const id = await sdk.storeSummary({
        request: 'Implementare auth',
        learned: 'OAuth2 richiede refresh token',
        completed: 'Login flow base',
        nextSteps: 'Aggiungere 2FA'
      });

      expect(typeof id).toBe('number');
      expect(id).toBeGreaterThan(0);
    });
  });

  describe('getRecentObservations', () => {
    it('dovrebbe restituire osservazioni recenti', async () => {
      await sdk.storeObservation({ type: 'test', title: 'Obs 1', content: 'Content 1' });
      await sdk.storeObservation({ type: 'test', title: 'Obs 2', content: 'Content 2' });

      const obs = await sdk.getRecentObservations(10);
      expect(obs.length).toBe(2);
    });

    it('dovrebbe rispettare il limite', async () => {
      await sdk.storeObservation({ type: 'test', title: 'Obs 1', content: 'C1' });
      await sdk.storeObservation({ type: 'test', title: 'Obs 2', content: 'C2' });
      await sdk.storeObservation({ type: 'test', title: 'Obs 3', content: 'C3' });

      const obs = await sdk.getRecentObservations(2);
      expect(obs.length).toBe(2);
    });
  });

  describe('getRecentSummaries', () => {
    it('dovrebbe restituire sommari recenti', async () => {
      await sdk.storeSummary({ learned: 'Lezione 1' });
      await sdk.storeSummary({ learned: 'Lezione 2' });

      const sums = await sdk.getRecentSummaries(5);
      expect(sums.length).toBe(2);
    });
  });

  describe('search', () => {
    it('dovrebbe cercare tra osservazioni e sommari', async () => {
      await sdk.storeObservation({ type: 'test', title: 'React hooks tutorial', content: 'useEffect pattern' });
      await sdk.storeSummary({ learned: 'React hooks sono potenti' });

      const results = await sdk.search('React');
      expect(results.observations.length).toBeGreaterThanOrEqual(1);
      expect(results.summaries.length).toBeGreaterThanOrEqual(1);
    });

    it('dovrebbe tornare vuoto per termine inesistente', async () => {
      const results = await sdk.search('xyz_inesistente_123');
      expect(results.observations.length).toBe(0);
      expect(results.summaries.length).toBe(0);
    });
  });

  describe('getContext', () => {
    it('dovrebbe restituire contesto del progetto', async () => {
      await sdk.storeObservation({ type: 'test', title: 'Obs test', content: 'Content' });
      await sdk.storeSummary({ learned: 'Appreso qualcosa' });

      const ctx = await sdk.getContext();
      expect(ctx.project).toBe('test-project');
      expect(ctx.relevantObservations.length).toBeGreaterThanOrEqual(1);
      expect(ctx.relevantSummaries.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('storePrompt e session', () => {
    it('dovrebbe creare sessione e salvare prompt', async () => {
      const session = await sdk.getOrCreateSession('test-session-1');
      expect(session.content_session_id).toBe('test-session-1');
      expect(session.project).toBe('test-project');

      const promptId = await sdk.storePrompt('test-session-1', 1, 'Come faccio a...');
      expect(promptId).toBeGreaterThan(0);
    });
  });

  describe('getProject', () => {
    it('dovrebbe restituire il nome del progetto configurato', () => {
      expect(sdk.getProject()).toBe('test-project');
    });
  });
});
