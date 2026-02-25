import { createRequire } from 'module';const require = createRequire(import.meta.url);

// src/utils/logger.ts
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
var LogLevel = /* @__PURE__ */ ((LogLevel2) => {
  LogLevel2[LogLevel2["DEBUG"] = 0] = "DEBUG";
  LogLevel2[LogLevel2["INFO"] = 1] = "INFO";
  LogLevel2[LogLevel2["WARN"] = 2] = "WARN";
  LogLevel2[LogLevel2["ERROR"] = 3] = "ERROR";
  LogLevel2[LogLevel2["SILENT"] = 4] = "SILENT";
  return LogLevel2;
})(LogLevel || {});
var DEFAULT_DATA_DIR = join(homedir(), ".contextkit");
var Logger = class {
  level = null;
  useColor;
  logFilePath = null;
  logFileInitialized = false;
  constructor() {
    this.useColor = process.stdout.isTTY ?? false;
  }
  /**
   * Initialize log file path and ensure directory exists (lazy initialization)
   */
  ensureLogFileInitialized() {
    if (this.logFileInitialized) return;
    this.logFileInitialized = true;
    try {
      const logsDir = join(DEFAULT_DATA_DIR, "logs");
      if (!existsSync(logsDir)) {
        mkdirSync(logsDir, { recursive: true });
      }
      const date = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      this.logFilePath = join(logsDir, `kiro-memory-${date}.log`);
    } catch (error) {
      console.error("[LOGGER] Failed to initialize log file:", error);
      this.logFilePath = null;
    }
  }
  /**
   * Lazy-load log level from settings file
   */
  getLevel() {
    if (this.level === null) {
      try {
        const settingsPath = join(DEFAULT_DATA_DIR, "settings.json");
        if (existsSync(settingsPath)) {
          const settingsData = readFileSync(settingsPath, "utf-8");
          const settings = JSON.parse(settingsData);
          const envLevel = (settings.KIRO_MEMORY_LOG_LEVEL || settings.CONTEXTKIT_LOG_LEVEL || "INFO").toUpperCase();
          this.level = LogLevel[envLevel] ?? 1 /* INFO */;
        } else {
          this.level = 1 /* INFO */;
        }
      } catch (error) {
        this.level = 1 /* INFO */;
      }
    }
    return this.level;
  }
  /**
   * Create correlation ID for tracking an observation through the pipeline
   */
  correlationId(sessionId, observationNum) {
    return `obs-${sessionId}-${observationNum}`;
  }
  /**
   * Create session correlation ID
   */
  sessionId(sessionId) {
    return `session-${sessionId}`;
  }
  /**
   * Format data for logging - create compact summaries instead of full dumps
   */
  formatData(data) {
    if (data === null || data === void 0) return "";
    if (typeof data === "string") return data;
    if (typeof data === "number") return data.toString();
    if (typeof data === "boolean") return data.toString();
    if (typeof data === "object") {
      if (data instanceof Error) {
        return this.getLevel() === 0 /* DEBUG */ ? `${data.message}
${data.stack}` : data.message;
      }
      if (Array.isArray(data)) {
        return `[${data.length} items]`;
      }
      const keys = Object.keys(data);
      if (keys.length === 0) return "{}";
      if (keys.length <= 3) {
        return JSON.stringify(data);
      }
      return `{${keys.length} keys: ${keys.slice(0, 3).join(", ")}...}`;
    }
    return String(data);
  }
  /**
   * Format timestamp in local timezone (YYYY-MM-DD HH:MM:SS.mmm)
   */
  formatTimestamp(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    const ms = String(date.getMilliseconds()).padStart(3, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms}`;
  }
  /**
   * Core logging method
   */
  log(level, component, message, context, data) {
    if (level < this.getLevel()) return;
    this.ensureLogFileInitialized();
    const timestamp = this.formatTimestamp(/* @__PURE__ */ new Date());
    const levelStr = LogLevel[level].padEnd(5);
    const componentStr = component.padEnd(6);
    let correlationStr = "";
    if (context?.correlationId) {
      correlationStr = `[${context.correlationId}] `;
    } else if (context?.sessionId) {
      correlationStr = `[session-${context.sessionId}] `;
    }
    let dataStr = "";
    if (data !== void 0 && data !== null) {
      if (data instanceof Error) {
        dataStr = this.getLevel() === 0 /* DEBUG */ ? `
${data.message}
${data.stack}` : ` ${data.message}`;
      } else if (this.getLevel() === 0 /* DEBUG */ && typeof data === "object") {
        dataStr = "\n" + JSON.stringify(data, null, 2);
      } else {
        dataStr = " " + this.formatData(data);
      }
    }
    let contextStr = "";
    if (context) {
      const { sessionId, memorySessionId, correlationId, ...rest } = context;
      if (Object.keys(rest).length > 0) {
        const pairs = Object.entries(rest).map(([k, v]) => `${k}=${v}`);
        contextStr = ` {${pairs.join(", ")}}`;
      }
    }
    const logLine = `[${timestamp}] [${levelStr}] [${componentStr}] ${correlationStr}${message}${contextStr}${dataStr}`;
    if (this.logFilePath) {
      try {
        appendFileSync(this.logFilePath, logLine + "\n", "utf8");
      } catch (error) {
        process.stderr.write(`[LOGGER] Failed to write to log file: ${error}
`);
      }
    } else {
      process.stderr.write(logLine + "\n");
    }
  }
  // Public logging methods
  debug(component, message, context, data) {
    this.log(0 /* DEBUG */, component, message, context, data);
  }
  info(component, message, context, data) {
    this.log(1 /* INFO */, component, message, context, data);
  }
  warn(component, message, context, data) {
    this.log(2 /* WARN */, component, message, context, data);
  }
  error(component, message, context, data) {
    this.log(3 /* ERROR */, component, message, context, data);
  }
  /**
   * Log data flow: input → processing
   */
  dataIn(component, message, context, data) {
    this.info(component, `\u2192 ${message}`, context, data);
  }
  /**
   * Log data flow: processing → output
   */
  dataOut(component, message, context, data) {
    this.info(component, `\u2190 ${message}`, context, data);
  }
  /**
   * Log successful completion
   */
  success(component, message, context, data) {
    this.info(component, `\u2713 ${message}`, context, data);
  }
  /**
   * Log failure
   */
  failure(component, message, context, data) {
    this.error(component, `\u2717 ${message}`, context, data);
  }
  /**
   * Log timing information
   */
  timing(component, message, durationMs, context) {
    this.info(component, `\u23F1 ${message}`, context, { duration: `${durationMs}ms` });
  }
  /**
   * Happy Path Error - logs when the expected "happy path" fails but we have a fallback
   */
  happyPathError(component, message, context, data, fallback = "") {
    const stack = new Error().stack || "";
    const stackLines = stack.split("\n");
    const callerLine = stackLines[2] || "";
    const callerMatch = callerLine.match(/at\s+(?:.*\s+)?\(?([^:]+):(\d+):(\d+)\)?/);
    const location = callerMatch ? `${callerMatch[1].split("/").pop()}:${callerMatch[2]}` : "unknown";
    const enhancedContext = {
      ...context,
      location
    };
    this.warn(component, `[HAPPY-PATH] ${message}`, enhancedContext, data);
    return fallback;
  }
};
var logger = new Logger();

// src/services/search/EmbeddingService.ts
var EmbeddingService = class {
  provider = null;
  model = null;
  initialized = false;
  initializing = null;
  /**
   * Inizializza il servizio di embedding.
   * Tenta fastembed, poi @huggingface/transformers, poi fallback a null.
   */
  async initialize() {
    if (this.initialized) return this.provider !== null;
    if (this.initializing) return this.initializing;
    this.initializing = this._doInitialize();
    const result = await this.initializing;
    this.initializing = null;
    return result;
  }
  async _doInitialize() {
    try {
      const fastembed = await import("fastembed");
      const EmbeddingModel = fastembed.EmbeddingModel || fastembed.default?.EmbeddingModel;
      const FlagEmbedding = fastembed.FlagEmbedding || fastembed.default?.FlagEmbedding;
      if (FlagEmbedding && EmbeddingModel) {
        this.model = await FlagEmbedding.init({
          model: EmbeddingModel.BGESmallENV15
        });
        this.provider = "fastembed";
        this.initialized = true;
        logger.info("EMBEDDING", "Inizializzato con fastembed (BGE-small-en-v1.5)");
        return true;
      }
    } catch (error) {
      logger.debug("EMBEDDING", `fastembed non disponibile: ${error}`);
    }
    try {
      const transformers = await import("@huggingface/transformers");
      const pipeline = transformers.pipeline || transformers.default?.pipeline;
      if (pipeline) {
        this.model = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
          quantized: true
        });
        this.provider = "transformers";
        this.initialized = true;
        logger.info("EMBEDDING", "Inizializzato con @huggingface/transformers (all-MiniLM-L6-v2)");
        return true;
      }
    } catch (error) {
      logger.debug("EMBEDDING", `@huggingface/transformers non disponibile: ${error}`);
    }
    this.provider = null;
    this.initialized = true;
    logger.warn("EMBEDDING", "Nessun provider embedding disponibile, ricerca semantica disabilitata");
    return false;
  }
  /**
   * Genera embedding per un singolo testo.
   * Ritorna Float32Array con 384 dimensioni, o null se non disponibile.
   */
  async embed(text) {
    if (!this.initialized) await this.initialize();
    if (!this.provider || !this.model) return null;
    try {
      const truncated = text.substring(0, 2e3);
      if (this.provider === "fastembed") {
        return await this._embedFastembed(truncated);
      } else if (this.provider === "transformers") {
        return await this._embedTransformers(truncated);
      }
    } catch (error) {
      logger.error("EMBEDDING", `Errore generazione embedding: ${error}`);
    }
    return null;
  }
  /**
   * Genera embeddings in batch.
   */
  async embedBatch(texts) {
    if (!this.initialized) await this.initialize();
    if (!this.provider || !this.model) return texts.map(() => null);
    const results = [];
    for (const text of texts) {
      try {
        const embedding = await this.embed(text);
        results.push(embedding);
      } catch {
        results.push(null);
      }
    }
    return results;
  }
  /**
   * Verifica se il servizio è disponibile.
   */
  isAvailable() {
    return this.initialized && this.provider !== null;
  }
  /**
   * Nome del provider attivo.
   */
  getProvider() {
    return this.provider;
  }
  /**
   * Dimensioni del vettore embedding.
   */
  getDimensions() {
    return 384;
  }
  // --- Provider specifici ---
  async _embedFastembed(text) {
    const embeddings = this.model.embed([text], 1);
    for await (const batch of embeddings) {
      if (batch && batch.length > 0) {
        const vec = batch[0];
        return vec instanceof Float32Array ? vec : new Float32Array(vec);
      }
    }
    return null;
  }
  async _embedTransformers(text) {
    const output = await this.model(text, {
      pooling: "mean",
      normalize: true
    });
    if (output?.data) {
      return output.data instanceof Float32Array ? output.data : new Float32Array(output.data);
    }
    return null;
  }
};
var embeddingService = null;
function getEmbeddingService() {
  if (!embeddingService) {
    embeddingService = new EmbeddingService();
  }
  return embeddingService;
}

// src/services/search/VectorSearch.ts
function cosineSimilarity(a, b) {
  if (a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  return dotProduct / denominator;
}
function float32ToBuffer(arr) {
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
}
function bufferToFloat32(buf) {
  const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return new Float32Array(arrayBuffer);
}
var VectorSearch = class {
  /**
   * Ricerca semantica: calcola cosine similarity tra query e tutti gli embeddings.
   */
  async search(db, queryEmbedding, options = {}) {
    const limit = options.limit || 10;
    const threshold = options.threshold || 0.3;
    try {
      let sql = `
        SELECT e.observation_id, e.embedding,
               o.title, o.text, o.type, o.project, o.created_at, o.created_at_epoch
        FROM observation_embeddings e
        JOIN observations o ON o.id = e.observation_id
      `;
      const params = [];
      if (options.project) {
        sql += " WHERE o.project = ?";
        params.push(options.project);
      }
      const rows = db.query(sql).all(...params);
      const scored = [];
      for (const row of rows) {
        const embedding = bufferToFloat32(row.embedding);
        const similarity = cosineSimilarity(queryEmbedding, embedding);
        if (similarity >= threshold) {
          scored.push({
            id: row.observation_id,
            observationId: row.observation_id,
            similarity,
            title: row.title,
            text: row.text,
            type: row.type,
            project: row.project,
            created_at: row.created_at,
            created_at_epoch: row.created_at_epoch
          });
        }
      }
      scored.sort((a, b) => b.similarity - a.similarity);
      return scored.slice(0, limit);
    } catch (error) {
      logger.error("VECTOR", `Errore ricerca vettoriale: ${error}`);
      return [];
    }
  }
  /**
   * Salva embedding per un'osservazione.
   */
  async storeEmbedding(db, observationId, embedding, model) {
    try {
      const blob = float32ToBuffer(embedding);
      db.query(`
        INSERT OR REPLACE INTO observation_embeddings
          (observation_id, embedding, model, dimensions, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        observationId,
        blob,
        model,
        embedding.length,
        (/* @__PURE__ */ new Date()).toISOString()
      );
      logger.debug("VECTOR", `Embedding salvato per osservazione ${observationId}`);
    } catch (error) {
      logger.error("VECTOR", `Errore salvataggio embedding: ${error}`);
    }
  }
  /**
   * Genera embeddings per osservazioni che non li hanno ancora.
   */
  async backfillEmbeddings(db, batchSize = 50) {
    const embeddingService2 = getEmbeddingService();
    if (!await embeddingService2.initialize()) {
      logger.warn("VECTOR", "Embedding service non disponibile, backfill saltato");
      return 0;
    }
    const rows = db.query(`
      SELECT o.id, o.title, o.text, o.narrative, o.concepts
      FROM observations o
      LEFT JOIN observation_embeddings e ON e.observation_id = o.id
      WHERE e.observation_id IS NULL
      ORDER BY o.created_at_epoch DESC
      LIMIT ?
    `).all(batchSize);
    if (rows.length === 0) return 0;
    let count = 0;
    const model = embeddingService2.getProvider() || "unknown";
    for (const row of rows) {
      const parts = [row.title];
      if (row.text) parts.push(row.text);
      if (row.narrative) parts.push(row.narrative);
      if (row.concepts) parts.push(row.concepts);
      const fullText = parts.join(" ").substring(0, 2e3);
      const embedding = await embeddingService2.embed(fullText);
      if (embedding) {
        await this.storeEmbedding(db, row.id, embedding, model);
        count++;
      }
    }
    logger.info("VECTOR", `Backfill completato: ${count}/${rows.length} embeddings generati`);
    return count;
  }
  /**
   * Statistiche sugli embeddings.
   */
  getStats(db) {
    try {
      const totalRow = db.query("SELECT COUNT(*) as count FROM observations").get();
      const embeddedRow = db.query("SELECT COUNT(*) as count FROM observation_embeddings").get();
      const total = totalRow?.count || 0;
      const embedded = embeddedRow?.count || 0;
      const percentage = total > 0 ? Math.round(embedded / total * 100) : 0;
      return { total, embedded, percentage };
    } catch {
      return { total: 0, embedded: 0, percentage: 0 };
    }
  }
};
var vectorSearch = null;
function getVectorSearch() {
  if (!vectorSearch) {
    vectorSearch = new VectorSearch();
  }
  return vectorSearch;
}
export {
  VectorSearch,
  cosineSimilarity,
  getVectorSearch
};
