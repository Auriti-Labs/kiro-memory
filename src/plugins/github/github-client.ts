/**
 * Client HTTP per le GitHub API v3 (REST).
 *
 * Usa fetch() nativo — zero dipendenze esterne (niente octokit).
 * Supporta:
 *   - Rate limiting awareness (legge X-RateLimit headers)
 *   - Retry automatico su 403/429 con backoff esponenziale
 *   - URL base configurabile per GitHub Enterprise
 *   - Cache in-memory per ridurre chiamate API
 */

import type { PluginLogger } from '../../services/plugins/types.js';

// ── Tipi ─────────────────────────────────────────────────────────────────────

export interface GitHubClientConfig {
  /** Personal Access Token per autenticazione */
  token: string;
  /** URL base per le API (default: https://api.github.com) */
  baseUrl?: string;
  /** Tentativi massimi per retry su rate limit (default: 3) */
  maxRetries?: number;
  /** TTL cache in millisecondi (default: 5 minuti) */
  cacheTtlMs?: number;
}

export interface GitHubIssue {
  number: number;
  title: string;
  state: string;
  html_url: string;
  labels: Array<{ name: string }>;
}

export interface GitHubComment {
  id: number;
  body: string;
  html_url: string;
}

export interface RateLimitInfo {
  /** Richieste rimanenti prima del limite */
  remaining: number;
  /** Timestamp Unix (secondi) del reset */
  resetAt: number;
}

// ── Cache entry ──────────────────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

// ── Client ───────────────────────────────────────────────────────────────────

export class GitHubClient {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly cacheTtlMs: number;
  private readonly logger: PluginLogger;

  /** Cache in-memory per le issue (chiave: owner/repo#number) */
  private readonly issueCache = new Map<string, CacheEntry<GitHubIssue>>();

  /** Ultimo stato rate limit noto */
  private rateLimit: RateLimitInfo = { remaining: 5000, resetAt: 0 };

  constructor(config: GitHubClientConfig, logger: PluginLogger) {
    this.token = config.token;
    this.baseUrl = (config.baseUrl || 'https://api.github.com').replace(/\/$/, '');
    this.maxRetries = config.maxRetries ?? 3;
    this.cacheTtlMs = config.cacheTtlMs ?? 5 * 60 * 1000; // 5 minuti
    this.logger = logger;
  }

  // ── Metodi pubblici ──────────────────────────────────────────────────────

  /**
   * Recupera i dati di una issue specifica.
   * Usa cache in-memory per evitare chiamate ripetute.
   */
  async getIssue(owner: string, repo: string, issueNumber: number): Promise<GitHubIssue> {
    const cacheKey = `${owner}/${repo}#${issueNumber}`;

    // Controlla cache
    const cached = this.issueCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      this.logger.info(`Cache hit per issue ${cacheKey}`);
      return cached.data;
    }

    const url = `${this.baseUrl}/repos/${owner}/${repo}/issues/${issueNumber}`;
    const data = await this.request<GitHubIssue>(url);

    // Salva in cache
    this.issueCache.set(cacheKey, {
      data,
      expiresAt: Date.now() + this.cacheTtlMs,
    });

    return data;
  }

  /**
   * Aggiunge un commento a una issue.
   * Non usa cache (operazione di scrittura).
   */
  async addComment(owner: string, repo: string, issueNumber: number, body: string): Promise<GitHubComment> {
    const url = `${this.baseUrl}/repos/${owner}/${repo}/issues/${issueNumber}/comments`;

    return this.request<GitHubComment>(url, {
      method: 'POST',
      body: JSON.stringify({ body }),
    });
  }

  /**
   * Restituisce le informazioni correnti sul rate limit.
   */
  getRateLimit(): RateLimitInfo {
    return { ...this.rateLimit };
  }

  /**
   * Svuota la cache delle issue.
   */
  clearCache(): void {
    this.issueCache.clear();
    this.logger.info('Cache issue svuotata');
  }

  // ── Request engine con retry ─────────────────────────────────────────────

  /**
   * Esegue una richiesta HTTP verso le GitHub API.
   * Gestisce automaticamente:
   *   - Headers di autenticazione
   *   - Parsing della risposta JSON
   *   - Aggiornamento rate limit
   *   - Retry su 403/429 con backoff esponenziale
   */
  private async request<T>(url: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Authorization': `token ${this.token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'kiro-memory-plugin-github/1.0.0',
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      // Se rate limit esaurito, aspetta il reset
      if (this.rateLimit.remaining === 0) {
        const waitMs = (this.rateLimit.resetAt * 1000) - Date.now();
        if (waitMs > 0 && waitMs < 60_000) {
          this.logger.warn(`Rate limit esaurito. Attendo ${Math.ceil(waitMs / 1000)}s prima del reset.`);
          await this.sleep(waitMs);
        }
      }

      try {
        const response = await fetch(url, {
          ...options,
          headers: { ...headers, ...(options.headers as Record<string, string> || {}) },
        });

        // Aggiorna rate limit dai header della risposta
        this.updateRateLimit(response);

        if (response.ok) {
          return await response.json() as T;
        }

        // Gestione errori specifici
        if (response.status === 404) {
          throw new Error(`Risorsa non trovata: ${url}`);
        }

        if (response.status === 401) {
          throw new Error('Token GitHub non valido o scaduto');
        }

        // Rate limit (403/429): retry con backoff
        if ((response.status === 403 || response.status === 429) && attempt < this.maxRetries) {
          const retryAfter = response.headers.get('retry-after');
          const backoffMs = retryAfter
            ? parseInt(retryAfter, 10) * 1000
            : Math.min(1000 * Math.pow(2, attempt), 30_000); // Max 30s

          this.logger.warn(`Rate limit (${response.status}). Retry ${attempt + 1}/${this.maxRetries} tra ${Math.ceil(backoffMs / 1000)}s`);
          await this.sleep(backoffMs);
          continue;
        }

        // Errore non recuperabile
        const errorBody = await response.text().catch(() => 'corpo non leggibile');
        throw new Error(`GitHub API errore ${response.status}: ${errorBody}`);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // Non fare retry su errori non di rete
        if (lastError.message.includes('non trovata') ||
            lastError.message.includes('non valido') ||
            lastError.message.includes('scaduto')) {
          throw lastError;
        }

        // Errore di rete: retry se abbiamo ancora tentativi
        if (attempt < this.maxRetries) {
          const backoffMs = Math.min(1000 * Math.pow(2, attempt), 30_000);
          this.logger.warn(`Errore di rete, retry ${attempt + 1}/${this.maxRetries}: ${lastError.message}`);
          await this.sleep(backoffMs);
          continue;
        }
      }
    }

    throw lastError || new Error(`Richiesta fallita dopo ${this.maxRetries} tentativi`);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Aggiorna le informazioni di rate limit dalla risposta HTTP.
   */
  private updateRateLimit(response: Response): void {
    const remaining = response.headers.get('x-ratelimit-remaining');
    const reset = response.headers.get('x-ratelimit-reset');

    if (remaining !== null) {
      this.rateLimit.remaining = parseInt(remaining, 10);
    }
    if (reset !== null) {
      this.rateLimit.resetAt = parseInt(reset, 10);
    }
  }

  /**
   * Utility per await su un delay (usato per backoff e attesa rate limit).
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
