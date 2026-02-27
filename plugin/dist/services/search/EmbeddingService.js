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
   * Initialize the embedding service.
   * Tries fastembed, then @huggingface/transformers, then fallback to null.
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
        logger.info("EMBEDDING", "Initialized with fastembed (BGE-small-en-v1.5)");
        return true;
      }
    } catch (error) {
      logger.debug("EMBEDDING", `fastembed not available: ${error}`);
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
        logger.info("EMBEDDING", "Initialized with @huggingface/transformers (all-MiniLM-L6-v2)");
        return true;
      }
    } catch (error) {
      logger.debug("EMBEDDING", `@huggingface/transformers not available: ${error}`);
    }
    this.provider = null;
    this.initialized = true;
    logger.warn("EMBEDDING", "No embedding provider available, semantic search disabled");
    return false;
  }
  /**
   * Generate embedding for a single text.
   * Returns Float32Array with 384 dimensions, or null if not available.
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
      logger.error("EMBEDDING", `Error generating embedding: ${error}`);
    }
    return null;
  }
  /**
   * Generate embeddings in batch.
   * Uses native batch support when available (fastembed, transformers),
   * falls back to serial processing on batch failure.
   */
  async embedBatch(texts) {
    if (!this.initialized) await this.initialize();
    if (!this.provider || !this.model) return texts.map(() => null);
    if (texts.length === 0) return [];
    const truncated = texts.map((t) => t.substring(0, 2e3));
    try {
      if (this.provider === "fastembed") {
        return await this._embedBatchFastembed(truncated);
      } else if (this.provider === "transformers") {
        return await this._embedBatchTransformers(truncated);
      }
    } catch (error) {
      logger.warn("EMBEDDING", `Batch embedding failed, falling back to serial: ${error}`);
    }
    return this._embedBatchSerial(truncated);
  }
  /**
   * Check if the service is available.
   */
  isAvailable() {
    return this.initialized && this.provider !== null;
  }
  /**
   * Name of the active provider.
   */
  getProvider() {
    return this.provider;
  }
  /**
   * Embedding vector dimensions.
   */
  getDimensions() {
    return 384;
  }
  // --- Batch implementations ---
  /**
   * Native batch embedding with fastembed.
   * FlagEmbedding.embed() accepts string[] and returns an async iterable of batches.
   */
  async _embedBatchFastembed(texts) {
    const results = [];
    const embeddings = this.model.embed(texts, texts.length);
    for await (const batch of embeddings) {
      if (batch) {
        for (const vec of batch) {
          results.push(vec instanceof Float32Array ? vec : new Float32Array(vec));
        }
      }
    }
    while (results.length < texts.length) {
      results.push(null);
    }
    return results;
  }
  /**
   * Batch embedding with @huggingface/transformers pipeline.
   * The pipeline accepts string[] and returns a Tensor with shape [N, dims].
   */
  async _embedBatchTransformers(texts) {
    const output = await this.model(texts, {
      pooling: "mean",
      normalize: true
    });
    if (!output?.data) {
      return texts.map(() => null);
    }
    const dims = this.getDimensions();
    const data = output.data instanceof Float32Array ? output.data : new Float32Array(output.data);
    const results = [];
    for (let i = 0; i < texts.length; i++) {
      const offset = i * dims;
      if (offset + dims <= data.length) {
        results.push(data.slice(offset, offset + dims));
      } else {
        results.push(null);
      }
    }
    return results;
  }
  /**
   * Serial fallback: embed texts one at a time.
   * Used when native batch fails.
   */
  async _embedBatchSerial(texts) {
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
  // --- Single-text provider implementations ---
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
export {
  EmbeddingService,
  getEmbeddingService
};
