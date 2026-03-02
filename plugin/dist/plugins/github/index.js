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
      "User-Agent": "kiro-memory-plugin-github/1.0.0"
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

// src/plugins/github/issue-parser.ts
var KEYWORD_PATTERN = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+(?:([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+))?#(\d+)\b/gi;
var FULL_REF_PATTERN = /(?:^|[\s,(])([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)#(\d+)\b/g;
var STANDALONE_PATTERN = /(?:^|[\s,(:])#(\d+)\b/g;
function parseIssueReferences(text) {
  if (!text || typeof text !== "string") return [];
  const refs = /* @__PURE__ */ new Map();
  let match;
  KEYWORD_PATTERN.lastIndex = 0;
  while ((match = KEYWORD_PATTERN.exec(text)) !== null) {
    const owner = match[1] || void 0;
    const repo = match[2] || void 0;
    const number = parseInt(match[3], 10);
    const keyword = match[0].split(/\s/)[0].toLowerCase();
    const key = makeKey(owner, repo, number);
    refs.set(key, { number, owner, repo, keyword });
  }
  FULL_REF_PATTERN.lastIndex = 0;
  while ((match = FULL_REF_PATTERN.exec(text)) !== null) {
    const owner = match[1];
    const repo = match[2];
    const number = parseInt(match[3], 10);
    const key = makeKey(owner, repo, number);
    if (!refs.has(key)) {
      refs.set(key, { number, owner, repo });
    }
  }
  STANDALONE_PATTERN.lastIndex = 0;
  while ((match = STANDALONE_PATTERN.exec(text)) !== null) {
    const number = parseInt(match[1], 10);
    const key = makeKey(void 0, void 0, number);
    if (!refs.has(key) && !hasRefWithNumber(refs, number)) {
      refs.set(key, { number });
    }
  }
  return Array.from(refs.values());
}
function makeKey(owner, repo, number) {
  if (owner && repo) {
    return `${owner}/${repo}#${number}`;
  }
  return `#${number}`;
}
function hasRefWithNumber(refs, number) {
  for (const ref of refs.values()) {
    if (ref.number === number) return true;
  }
  return false;
}

// src/plugins/github/index.ts
var GitHubPlugin = class {
  name = "kiro-memory-plugin-github";
  version = "1.0.0";
  description = "Integrazione GitHub: rileva issue references e commenta a fine sessione";
  minKiroVersion = "2.0.0";
  /** Client HTTP per le GitHub API */
  client = null;
  /** Logger iniettato dal registry */
  logger = null;
  /** Configurazione validata */
  config = null;
  /** Mappa issue linkate nella sessione corrente (chiave: "owner/repo#number") */
  linkedIssues = /* @__PURE__ */ new Map();
  /** Hook esposti al registry */
  hooks = {
    onObservation: async (obs) => this.handleObservation(obs),
    onSessionEnd: async (session) => this.handleSessionEnd(session)
  };
  // ── Lifecycle ──────────────────────────────────────────────────────────────
  async init(context) {
    this.logger = context.logger;
    this.config = this.parseConfig(context.config);
    if (!this.config.token) {
      throw new Error('Configurazione mancante: "token" \xE8 obbligatorio per il plugin GitHub');
    }
    this.client = new GitHubClient(
      {
        token: this.config.token,
        baseUrl: this.config.baseUrl
      },
      this.logger
    );
    this.logger.info("Plugin GitHub inizializzato");
    if (this.config.repo) {
      this.logger.info(`Repository default: ${this.config.repo}`);
    }
  }
  async destroy() {
    this.client?.clearCache();
    this.linkedIssues.clear();
    this.client = null;
    this.config = null;
    this.logger?.info("Plugin GitHub distrutto");
    this.logger = null;
  }
  // ── Hook: onObservation ────────────────────────────────────────────────────
  /**
   * Rileva riferimenti issue nel titolo dell'osservazione.
   * Accumula le issue trovate per il commento a fine sessione.
   */
  async handleObservation(obs) {
    if (!this.client || !this.config) return;
    const refs = parseIssueReferences(obs.title);
    if (refs.length === 0) return;
    this.logger?.info(`Trovati ${refs.length} riferimenti issue in osservazione "${obs.title}"`);
    for (const ref of refs) {
      this.trackIssue(ref, obs.title);
    }
  }
  // ── Hook: onSessionEnd ─────────────────────────────────────────────────────
  /**
   * Commenta automaticamente sulle issue linkate con un riepilogo della sessione.
   * Chiamato alla chiusura di ogni sessione.
   */
  async handleSessionEnd(session) {
    if (!this.client || !this.config) return;
    if (this.config.autoComment === false) return;
    if (this.linkedIssues.size === 0) return;
    if (!session.summary) {
      this.logger?.info("Nessun summary di sessione, skip commento su issue");
      return;
    }
    this.logger?.info(`Fine sessione: commento su ${this.linkedIssues.size} issue linkate`);
    const issues = Array.from(this.linkedIssues.values());
    const results = await Promise.allSettled(
      issues.map((issue) => this.commentOnIssue(issue, session))
    );
    let successi = 0;
    let errori = 0;
    for (const result of results) {
      if (result.status === "fulfilled") {
        successi++;
      } else {
        errori++;
        this.logger?.warn(`Errore commento su issue: ${result.reason}`);
      }
    }
    this.logger?.info(`Commenti: ${successi} riusciti, ${errori} falliti`);
    this.linkedIssues.clear();
  }
  // ── Metodi privati ─────────────────────────────────────────────────────────
  /**
   * Traccia una issue reference trovata in un'osservazione.
   * Se la issue è già tracciata, aggiunge il titolo dell'osservazione.
   */
  trackIssue(ref, observationTitle) {
    const { owner, repo } = this.resolveOwnerRepo(ref);
    if (!owner || !repo) {
      this.logger?.warn(`Impossibile risolvere owner/repo per issue #${ref.number} \u2014 configura "repo" nel plugin`);
      return;
    }
    const key = `${owner}/${repo}#${ref.number}`;
    const existing = this.linkedIssues.get(key);
    if (existing) {
      existing.observationTitles.push(observationTitle);
      if (ref.keyword) existing.keywords.add(ref.keyword);
    } else {
      this.linkedIssues.set(key, {
        number: ref.number,
        owner,
        repo,
        observationTitles: [observationTitle],
        keywords: new Set(ref.keyword ? [ref.keyword] : [])
      });
    }
  }
  /**
   * Risolve owner e repo da un IssueReference.
   * Usa il reference se specifico, altrimenti il default dalla configurazione.
   */
  resolveOwnerRepo(ref) {
    if (ref.owner && ref.repo) {
      return { owner: ref.owner, repo: ref.repo };
    }
    if (this.config?.repo) {
      const parts = this.config.repo.split("/");
      if (parts.length === 2) {
        return { owner: parts[0], repo: parts[1] };
      }
    }
    return {};
  }
  /**
   * Genera il corpo del commento e lo posta sulla issue.
   */
  async commentOnIssue(issue, session) {
    if (!this.client || !session.summary) return;
    const body = this.formatComment(issue, session);
    await this.client.addComment(
      issue.owner,
      issue.repo,
      issue.number,
      body
    );
    this.logger?.info(`Commento postato su ${issue.owner}/${issue.repo}#${issue.number}`);
  }
  /**
   * Formatta il corpo del commento per una issue.
   */
  formatComment(issue, session) {
    const lines = [];
    lines.push(`### \u{1F9E0} Kiro Memory \u2014 Sessione \`${session.id}\``);
    lines.push("");
    lines.push(`**Progetto:** ${session.project}`);
    lines.push("");
    if (issue.keywords.size > 0) {
      const keywords = Array.from(issue.keywords).join(", ");
      lines.push(`**Azioni:** ${keywords}`);
      lines.push("");
    }
    if (issue.observationTitles.length > 0) {
      lines.push("**Osservazioni correlate:**");
      for (const title of issue.observationTitles.slice(0, 10)) {
        lines.push(`- ${title}`);
      }
      if (issue.observationTitles.length > 10) {
        lines.push(`- _...e altre ${issue.observationTitles.length - 10}_`);
      }
      lines.push("");
    }
    lines.push("**Riepilogo sessione:**");
    lines.push(session.summary || "_Nessun riepilogo disponibile_");
    lines.push("");
    lines.push("---");
    lines.push("_Commento generato automaticamente da [kiro-memory](https://github.com/Auriti-Labs/kiro-memory)_");
    return lines.join("\n");
  }
  /**
   * Parsa la configurazione grezza del plugin.
   * Valida i campi e restituisce un oggetto tipizzato.
   */
  parseConfig(raw) {
    return {
      token: typeof raw["token"] === "string" ? raw["token"] : "",
      repo: typeof raw["repo"] === "string" ? raw["repo"] : void 0,
      baseUrl: typeof raw["baseUrl"] === "string" ? raw["baseUrl"] : void 0,
      autoComment: raw["autoComment"] !== false
      // default: true
    };
  }
  // ── Metodi esposti per testing ─────────────────────────────────────────────
  /**
   * Restituisce le issue attualmente tracciate nella sessione.
   * @internal Usato solo nei test.
   */
  _getLinkedIssues() {
    return this.linkedIssues;
  }
  /**
   * Restituisce il client HTTP interno.
   * @internal Usato solo nei test.
   */
  _getClient() {
    return this.client;
  }
};
var index_default = new GitHubPlugin();
export {
  GitHubPlugin,
  index_default as default
};
