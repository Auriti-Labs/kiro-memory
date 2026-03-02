import { createRequire } from 'module';const require = createRequire(import.meta.url);

// src/plugins/slack/formatter.ts
function truncateText(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}
function buildHeaderBlock(project) {
  return {
    type: "header",
    text: {
      type: "plain_text",
      text: `Sessione completata: ${project}`,
      emoji: true
    }
  };
}
function buildStatsBlock(data) {
  return {
    type: "section",
    fields: [
      {
        type: "mrkdwn",
        text: `*Progetto:*
${data.project}`
      },
      {
        type: "mrkdwn",
        text: `*Sessione:*
\`${truncateText(data.sessionId, 12)}\``
      }
    ],
    text: {
      type: "mrkdwn",
      text: " "
      // Campo obbligatorio ma non usato quando ci sono fields
    }
  };
}
function buildSummaryBlock(summary) {
  const displayText = summary && summary.trim().length > 0 ? truncateText(summary.trim(), 2500) : "_Nessun sommario disponibile per questa sessione._";
  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*Sommario:*
${displayText}`
    }
  };
}
function buildDivider() {
  return { type: "divider" };
}
function buildContextBlock() {
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  return {
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `Kiro Memory | ${timestamp}`
      }
    ]
  };
}
function buildSlackPayload(data) {
  const blocks = [
    buildHeaderBlock(data.project),
    buildDivider(),
    buildStatsBlock(data),
    buildSummaryBlock(data.summary),
    buildDivider(),
    buildContextBlock()
  ];
  const fallback = data.summary ? `Sessione ${data.project} completata: ${truncateText(data.summary, 200)}` : `Sessione ${data.project} completata.`;
  return {
    ...data.channel ? { channel: data.channel } : {},
    text: fallback,
    blocks
  };
}

// src/plugins/slack/index.ts
var MAX_RETRIES = 3;
var INITIAL_RETRY_DELAY_MS = 1e3;
var FETCH_TIMEOUT_MS = 1e4;
function validateConfig(raw) {
  const webhookUrl = raw.webhookUrl;
  if (!webhookUrl || typeof webhookUrl !== "string") {
    throw new Error('Configurazione Slack: "webhookUrl" \xE8 obbligatorio e deve essere una stringa');
  }
  if (!webhookUrl.startsWith("https://")) {
    throw new Error('Configurazione Slack: "webhookUrl" deve iniziare con https://');
  }
  const channel = typeof raw.channel === "string" ? raw.channel : void 0;
  const events = Array.isArray(raw.events) ? raw.events.filter((e) => typeof e === "string") : ["onSessionEnd"];
  return { webhookUrl, channel, events };
}
async function sendWebhook(webhookUrl, payload, logger, fetchFn = globalThis.fetch) {
  let retries = 0;
  let delayMs = INITIAL_RETRY_DELAY_MS;
  while (retries <= MAX_RETRIES) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const response = await fetchFn(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (response.ok) {
        if (retries > 0) {
          logger.info(`Webhook inviato con successo dopo ${retries} retry`);
        }
        return { success: true, statusCode: response.status, retries };
      }
      if (response.status === 429) {
        if (retries >= MAX_RETRIES) {
          logger.warn(`Rate limited (429) dopo ${MAX_RETRIES} retry, rinuncio`);
          return { success: false, statusCode: 429, retries, error: "Rate limited: superato il numero massimo di retry" };
        }
        const retryAfter = response.headers.get("Retry-After");
        const waitMs = retryAfter ? Math.min(parseInt(retryAfter, 10) * 1e3, 3e4) : delayMs;
        logger.warn(`Rate limited (429), retry ${retries + 1}/${MAX_RETRIES} tra ${waitMs}ms`);
        await sleep(waitMs);
        retries++;
        delayMs *= 2;
        continue;
      }
      const errorBody = await response.text().catch(() => "");
      logger.error(`Webhook fallito con status ${response.status}: ${errorBody}`);
      return {
        success: false,
        statusCode: response.status,
        retries,
        error: `HTTP ${response.status}: ${errorBody}`
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Errore di rete nell'invio webhook: ${msg}`);
      return { success: false, retries, error: `Errore di rete: ${msg}` };
    }
  }
  return { success: false, retries, error: "Retry esauriti" };
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function createSlackPlugin() {
  let pluginConfig = null;
  let pluginLogger = null;
  const notifiedSessions = /* @__PURE__ */ new Set();
  async function handleSessionEnd(session) {
    if (!pluginConfig || !pluginLogger) {
      return;
    }
    if (notifiedSessions.has(session.id)) {
      pluginLogger.info(`Sessione ${session.id} gi\xE0 notificata, skip`);
      return;
    }
    if (!pluginConfig.events?.includes("onSessionEnd")) {
      pluginLogger.info("Hook onSessionEnd non abilitato nella configurazione");
      return;
    }
    const messageData = {
      sessionId: session.id,
      project: session.project,
      summary: session.summary,
      channel: pluginConfig.channel
    };
    const payload = buildSlackPayload(messageData);
    const result = await sendWebhook(
      pluginConfig.webhookUrl,
      payload,
      pluginLogger
    );
    if (result.success) {
      notifiedSessions.add(session.id);
      pluginLogger.info(`Notifica Slack inviata per sessione ${session.id}`);
    } else {
      pluginLogger.error(`Notifica Slack fallita per sessione ${session.id}: ${result.error}`);
    }
  }
  const plugin = {
    name: "kiro-memory-plugin-slack",
    version: "1.0.0",
    description: "Notifiche Slack per sessioni Kiro Memory",
    minKiroVersion: "2.0.0",
    async init(context) {
      pluginLogger = context.logger;
      pluginConfig = validateConfig(context.config);
      pluginLogger.info(`Inizializzato \u2014 webhook configurato, eventi: [${pluginConfig.events?.join(", ")}]`);
    },
    async destroy() {
      notifiedSessions.clear();
      pluginConfig = null;
      pluginLogger?.info("Plugin Slack distrutto");
      pluginLogger = null;
    },
    hooks: {
      onSessionEnd: handleSessionEnd
    }
  };
  return plugin;
}
var index_default = createSlackPlugin;
export {
  createSlackPlugin,
  index_default as default,
  sendWebhook,
  sleep,
  validateConfig
};
