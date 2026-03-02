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
export {
  buildContextBlock,
  buildDivider,
  buildHeaderBlock,
  buildSlackPayload,
  buildStatsBlock,
  buildSummaryBlock,
  truncateText
};
