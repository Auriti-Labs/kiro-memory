/**
 * Client HTTP per il worker Kiro Memory.
 *
 * Gestisce tutte le chiamate REST verso il worker Express in esecuzione
 * su porta 3001 (configurabile da impostazioni VS Code).
 * Utilizza il modulo nativo `http` di Node.js per evitare dipendenze esterne.
 */

import * as http from 'http';
import * as https from 'https';
import type * as vscode from 'vscode';

// ── Tipi risposta API ──────────────────────────────────────────────────────

export interface HealthResponse {
  status: 'ok' | 'error';
  timestamp: number;
  version: string;
}

export interface Observation {
  id: number;
  session_id: string;
  project: string;
  type: string;
  title: string;
  narrative: string | null;
  content: string | null;
  file_path: string | null;
  tool_name: string | null;
  concepts: string | null;
  files: string | null;
  created_at: string;
  created_at_epoch: number;
  discovery_tokens: number;
  hash: string | null;
}

export interface Session {
  id: number;
  session_id: string;
  project: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  observation_count: number;
  summary: string | null;
}

export interface SearchResults {
  observations: Observation[];
  summaries: SummaryResult[];
}

export interface SummaryResult {
  id: number;
  project: string;
  session_id: string;
  content: string;
  created_at: string;
}

export interface ContextResponse {
  project: string;
  observations: Observation[];
  summary: string | null;
  stats: ProjectStats;
}

export interface ProjectStats {
  project: string;
  total_observations: number;
  total_sessions: number;
  first_seen: string | null;
  last_seen: string | null;
  types: Record<string, number>;
}

// ── Classe client ──────────────────────────────────────────────────────────

export class KiroMemoryClient {
  private baseUrl: string;
  private timeout: number;
  private _isConnected: boolean = false;

  constructor(host: string, port: number, timeout: number = 3000) {
    this.baseUrl = `http://${host}:${port}`;
    this.timeout = timeout;
  }

  /** Stato corrente della connessione al worker */
  get isConnected(): boolean {
    return this._isConnected;
  }

  /**
   * Aggiorna la configurazione base URL quando cambiano le impostazioni VS Code.
   */
  updateConfig(host: string, port: number): void {
    this.baseUrl = `http://${host}:${port}`;
  }

  /**
   * Esegue una richiesta HTTP GET verso il worker.
   * Restituisce il body JSON parsato o lancia un errore.
   */
  private request<T>(path: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const transport = url.protocol === 'https:' ? https : http;

      const req = transport.get(url.toString(), { timeout: this.timeout }, (res) => {
        let body = '';

        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          body += chunk;
        });

        res.on('end', () => {
          try {
            if (res.statusCode && res.statusCode >= 400) {
              const errPayload = JSON.parse(body);
              reject(new Error(errPayload.error || `HTTP ${res.statusCode}`));
              return;
            }
            resolve(JSON.parse(body) as T);
          } catch {
            reject(new Error(`Risposta non JSON: ${body.slice(0, 100)}`));
          }
        });
      });

      req.on('error', (err: Error) => {
        this._isConnected = false;
        reject(err);
      });

      req.on('timeout', () => {
        req.destroy();
        this._isConnected = false;
        reject(new Error(`Timeout dopo ${this.timeout}ms`));
      });
    });
  }

  /**
   * Costruisce query string da parametri opzionali, filtrando i valori undefined.
   */
  private buildQuery(params: Record<string, string | number | undefined>): string {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
      }
    }
    return parts.length > 0 ? `?${parts.join('&')}` : '';
  }

  // ── Endpoint pubblici ────────────────────────────────────────────────────

  /**
   * Verifica che il worker sia attivo e risponda correttamente.
   * Aggiorna il flag isConnected.
   */
  async getHealth(): Promise<HealthResponse> {
    try {
      const result = await this.request<HealthResponse>('/health');
      this._isConnected = result.status === 'ok';
      return result;
    } catch (err) {
      this._isConnected = false;
      throw err;
    }
  }

  /**
   * Restituisce la lista di tutti i progetti distinti nel database.
   * GET /api/projects → string[]
   */
  async getProjects(): Promise<string[]> {
    return this.request<string[]>('/api/projects');
  }

  /**
   * Restituisce la lista paginata di osservazioni, opzionalmente filtrata per progetto.
   * GET /api/observations?project=&limit=&offset=
   */
  async getObservations(
    project?: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<Observation[]> {
    const query = this.buildQuery({ project, limit, offset });
    return this.request<Observation[]>(`/api/observations${query}`);
  }

  /**
   * Restituisce le sessioni, opzionalmente filtrate per progetto.
   * GET /api/sessions?project=&limit=
   */
  async getSessions(project?: string, limit: number = 50): Promise<Session[]> {
    const query = this.buildQuery({ project, limit });
    return this.request<Session[]>(`/api/sessions${query}`);
  }

  /**
   * Cerca osservazioni e sommari via FTS5.
   * GET /api/search?q=&project=
   */
  async search(query: string, project?: string): Promise<SearchResults> {
    const qs = this.buildQuery({ q: query, project });
    return this.request<SearchResults>(`/api/search${qs}`);
  }

  /**
   * Recupera il contesto recente per un progetto specifico.
   * GET /api/context/:project
   */
  async getContext(project: string): Promise<ContextResponse> {
    return this.request<ContextResponse>(`/api/context/${encodeURIComponent(project)}`);
  }

  /**
   * Statistiche aggregate per un progetto (totali, tipo, date).
   * GET /api/stats/:project
   */
  async getStats(project: string): Promise<ProjectStats> {
    return this.request<ProjectStats>(`/api/stats/${encodeURIComponent(project)}`);
  }
}

// ── Factory da configurazione VS Code ─────────────────────────────────────

/**
 * Crea un'istanza KiroMemoryClient leggendo le impostazioni correnti
 * dalla configurazione VS Code (kiroMemory.workerHost / workerPort).
 */
export function createClientFromConfig(
  config: ReturnType<typeof vscode.workspace.getConfiguration>
): KiroMemoryClient {
  const host = config.get<string>('workerHost', '127.0.0.1');
  const port = config.get<number>('workerPort', 3001);
  return new KiroMemoryClient(host, port);
}
