import { createRequire } from 'module';const require = createRequire(import.meta.url);

// src/plugins/github/github-client.ts
var GitHubClient = class {
  token;
  baseUrl;
  maxRetries;
  cacheTtlMs;
  logger;
  /** Cache in-memory per le issue (chiave: owner/repo#number) */
  issueCache = /* @__PURE__ */ new Map();
  /** Ultimo stato rate limit noto */
  rateLimit = { remaining: 5e3, resetAt: 0 };
  constructor(config, logger) {
    this.token = config.token;
    this.baseUrl = (config.baseUrl || "https://api.github.com").replace(/\/$/, "");
    this.maxRetries = config.maxRetries ?? 3;
    this.cacheTtlMs = config.cacheTtlMs ?? 5 * 60 * 1e3;
    this.logger = logger;
  }
  // ── Metodi pubblici ──────────────────────────────────────────────────────
  /**
   * Recupera i dati di una issue specifica.
   * Usa cache in-memory per evitare chiamate ripetute.
   */
  async getIssue(owner, repo, issueNumber) {
    const cacheKey = `${owner}/${repo}#${issueNumber}`;
    const cached = this.issueCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      this.logger.info(`Cache hit per issue ${cacheKey}`);
      return cached.data;
    }
    const url = `${this.baseUrl}/repos/${owner}/${repo}/issues/${issueNumber}`;
    const data = await this.request(url);
    this.issueCache.set(cacheKey, {
      data,
      expiresAt: Date.now() + this.cacheTtlMs
    });
    return data;
  }
  /**
   * Aggiunge un commento a una issue.
   * Non usa cache (operazione di scrittura).
   */
  async addComment(owner, repo, issueNumber, body) {
    const url = `${this.baseUrl}/repos/${owner}/${repo}/issues/${issueNumber}/comments`;
    return this.request(url, {
      method: "POST",
      body: JSON.stringify({ body })
    });
  }
  /**
   * Restituisce le informazioni correnti sul rate limit.
   */
  getRateLimit() {
    return { ...this.rateLimit };
  }
  /**
   * Svuota la cache delle issue.
   */
  clearCache() {
    this.issueCache.clear();
    this.logger.info("Cache issue svuotata");
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
  async request(url, options = {}) {
    const headers = {
      "Authorization": `token ${this.token}`,
      "Accept": "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      "User-Agent": "totalrecall-plugin-github/1.0.0"
    };
    let lastError = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (this.rateLimit.remaining === 0) {
        const waitMs = this.rateLimit.resetAt * 1e3 - Date.now();
        if (waitMs > 0 && waitMs < 6e4) {
          this.logger.warn(`Rate limit esaurito. Attendo ${Math.ceil(waitMs / 1e3)}s prima del reset.`);
          await this.sleep(waitMs);
        }
      }
      try {
        const response = await fetch(url, {
          ...options,
          headers: { ...headers, ...options.headers || {} }
        });
        this.updateRateLimit(response);
        if (response.ok) {
          return await response.json();
        }
        if (response.status === 404) {
          throw new Error(`Risorsa non trovata: ${url}`);
        }
        if (response.status === 401) {
          throw new Error("Token GitHub non valido o scaduto");
        }
        if ((response.status === 403 || response.status === 429) && attempt < this.maxRetries) {
          const retryAfter = response.headers.get("retry-after");
          const backoffMs = retryAfter ? parseInt(retryAfter, 10) * 1e3 : Math.min(1e3 * Math.pow(2, attempt), 3e4);
          this.logger.warn(`Rate limit (${response.status}). Retry ${attempt + 1}/${this.maxRetries} tra ${Math.ceil(backoffMs / 1e3)}s`);
          await this.sleep(backoffMs);
          continue;
        }
        const errorBody = await response.text().catch(() => "corpo non leggibile");
        throw new Error(`GitHub API errore ${response.status}: ${errorBody}`);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (lastError.message.includes("non trovata") || lastError.message.includes("non valido") || lastError.message.includes("scaduto")) {
          throw lastError;
        }
        if (attempt < this.maxRetries) {
          const backoffMs = Math.min(1e3 * Math.pow(2, attempt), 3e4);
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
  updateRateLimit(response) {
    const remaining = response.headers.get("x-ratelimit-remaining");
    const reset = response.headers.get("x-ratelimit-reset");
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
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
};
export {
  GitHubClient
};
