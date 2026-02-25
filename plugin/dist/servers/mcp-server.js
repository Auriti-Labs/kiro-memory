#!/usr/bin/env node
import { createRequire } from 'module';const require = createRequire(import.meta.url);

// src/servers/mcp-server.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
console.log = (...args) => console.error("[kiro-memory-mcp]", ...args);
var WORKER_HOST = process.env.KIRO_MEMORY_WORKER_HOST || "127.0.0.1";
var WORKER_PORT = process.env.KIRO_MEMORY_WORKER_PORT || "3001";
var WORKER_BASE = `http://${WORKER_HOST}:${WORKER_PORT}`;
async function callWorkerGET(endpoint, params = {}) {
  const url = new URL(endpoint, WORKER_BASE);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== void 0 && v !== null && v !== "") url.searchParams.set(k, v);
  });
  const resp = await fetch(url.toString(), { signal: AbortSignal.timeout(1e4) });
  if (!resp.ok) throw new Error(`Worker ${resp.status}: ${await resp.text()}`);
  return resp.json();
}
async function callWorkerPOST(endpoint, body) {
  const url = new URL(endpoint, WORKER_BASE);
  const resp = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(1e4)
  });
  if (!resp.ok) throw new Error(`Worker ${resp.status}: ${await resp.text()}`);
  return resp.json();
}
var TOOLS = [
  {
    name: "search",
    description: "Search Kiro Memory. Returns observations and summaries matching the query. Use this tool to find context from previous sessions.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Text to search in observations and summaries" },
        project: { type: "string", description: "Filter by project name (optional)" },
        type: { type: "string", description: "Filter by observation type: file-write, command, research, tool-use, constraint, decision, heuristic, rejected (optional)" },
        limit: { type: "number", description: "Max number of results (default: 20)" }
      },
      required: ["query"]
    }
  },
  {
    name: "timeline",
    description: "Show chronological context around a specific observation. Useful to understand what happened before and after an event.",
    inputSchema: {
      type: "object",
      properties: {
        anchor: { type: "number", description: "Observation ID as reference point" },
        depth_before: { type: "number", description: "Number of observations before (default: 5)" },
        depth_after: { type: "number", description: "Number of observations after (default: 5)" }
      },
      required: ["anchor"]
    }
  },
  {
    name: "get_observations",
    description: 'Retrieve full details of specific observations by ID. Use after "search" to get the complete content.',
    inputSchema: {
      type: "object",
      properties: {
        ids: {
          type: "array",
          items: { type: "number" },
          description: "Array of observation IDs to retrieve"
        }
      },
      required: ["ids"]
    }
  },
  {
    name: "get_context",
    description: "Retrieve recent context for a project: observations, summaries, and recent prompts.",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project name" }
      },
      required: ["project"]
    }
  },
  {
    name: "semantic_search",
    description: 'Semantic search using vector embeddings. Finds observations by meaning, not just keywords. E.g. searching "authentication fix" also finds "OAuth token refresh". Falls back to keyword search if embeddings are unavailable.',
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Natural language query for semantic search" },
        project: { type: "string", description: "Filter by project name (optional)" },
        limit: { type: "number", description: "Max number of results (default: 10)" }
      },
      required: ["query"]
    }
  },
  {
    name: "embedding_stats",
    description: "Show embedding statistics: total observations, how many have embeddings, embedding provider info.",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "store_knowledge",
    description: 'Store structured knowledge: constraints (rules), decisions (architectural choices), heuristics (soft preferences), or rejected solutions. This knowledge is boosted in search rankings and helps remember the "why" behind code decisions.',
    inputSchema: {
      type: "object",
      properties: {
        knowledge_type: {
          type: "string",
          enum: ["constraint", "decision", "heuristic", "rejected"],
          description: "Type of knowledge: constraint (hard/soft rules), decision (architectural choices with alternatives), heuristic (soft preferences), rejected (discarded solutions with reason)"
        },
        title: { type: "string", description: "Short descriptive title for the knowledge entry" },
        content: { type: "string", description: "Detailed content explaining the knowledge" },
        project: { type: "string", description: "Project name (required)" },
        severity: { type: "string", enum: ["hard", "soft"], description: "For constraints: hard (must never violate) or soft (prefer to follow)" },
        alternatives: { type: "array", items: { type: "string" }, description: "For decisions/rejected: alternative options considered" },
        reason: { type: "string", description: "For decisions/rejected: why this choice was made or rejected" },
        context: { type: "string", description: "For heuristics: when this preference applies" },
        confidence: { type: "string", enum: ["high", "medium", "low"], description: "For heuristics: confidence level" },
        concepts: { type: "array", items: { type: "string" }, description: "Related concepts/tags (optional)" },
        files: { type: "array", items: { type: "string" }, description: "Related files (optional)" }
      },
      required: ["knowledge_type", "title", "content", "project"]
    }
  },
  {
    name: "resume_session",
    description: "Resume a previous coding session. Returns the checkpoint with task, progress, next steps, and relevant files from the last session on this project. Use when starting a new session to continue previous work.",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project name (optional, uses auto-detected project from environment)" },
        session_id: { type: "number", description: "Specific session ID to resume (optional, uses latest checkpoint for the project)" }
      },
      required: []
    }
  },
  {
    name: "save_memory",
    description: "Save a memory/observation manually. Use to persist important information, learnings, decisions, or context that should be remembered across sessions.",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project name (required)" },
        title: { type: "string", description: "Short descriptive title for the memory" },
        content: { type: "string", description: "Full content of the memory to save" },
        type: { type: "string", description: "Observation type: research, file-write, command, etc. (default: research)" },
        concepts: { type: "array", items: { type: "string" }, description: "Related concepts/tags (optional)" }
      },
      required: ["project", "title", "content"]
    }
  },
  {
    name: "generate_report",
    description: "Generate an activity report for a project. Returns a markdown summary with observations, sessions, learnings, completed tasks, and file hotspots for the specified time period.",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project name (optional, uses auto-detected project)" },
        period: { type: "string", description: 'Time period: "weekly" (default) or "monthly"' }
      },
      required: []
    }
  }
];
var handlers = {
  async search(args) {
    const result = await callWorkerGET("/api/search", {
      q: args.query,
      project: args.project || "",
      type: args.type || "",
      limit: String(args.limit || 20)
    });
    const obs = result.observations || [];
    const sums = result.summaries || [];
    if (obs.length === 0 && sums.length === 0) {
      return "No results found for the query.";
    }
    let output = `## Search Results: "${args.query}"

`;
    if (obs.length > 0) {
      output += `### Observations (${obs.length})

`;
      output += "| ID | Type | Title | Date |\n|---|---|---|---|\n";
      obs.forEach((o) => {
        output += `| ${o.id} | ${o.type} | ${o.title} | ${o.created_at?.split("T")[0] || ""} |
`;
      });
      output += "\n";
    }
    if (sums.length > 0) {
      output += `### Summaries (${sums.length})

`;
      sums.forEach((s) => {
        if (s.learned) output += `- **Learned**: ${s.learned}
`;
        if (s.completed) output += `- **Completed**: ${s.completed}
`;
      });
    }
    return output;
  },
  async timeline(args) {
    const result = await callWorkerGET("/api/timeline", {
      anchor: String(args.anchor),
      depth_before: String(args.depth_before || 5),
      depth_after: String(args.depth_after || 5)
    });
    const entries = result.timeline || result || [];
    if (!Array.isArray(entries) || entries.length === 0) {
      return `No context found around observation ${args.anchor}.`;
    }
    let output = `## Timeline around observation #${args.anchor}

`;
    entries.forEach((e) => {
      const marker = e.id === args.anchor ? "\u2192 " : "  ";
      output += `${marker}**#${e.id}** [${e.type}] ${e.title} (${e.created_at?.split("T")[0] || ""})
`;
      if (e.content) output += `  ${e.content.substring(0, 200)}
`;
      output += "\n";
    });
    return output;
  },
  async get_observations(args) {
    const result = await callWorkerPOST("/api/observations/batch", { ids: args.ids });
    const obs = result.observations || result || [];
    if (!Array.isArray(obs) || obs.length === 0) {
      return "No observations found for the specified IDs.";
    }
    let output = `## Observation Details

`;
    obs.forEach((o) => {
      output += `### #${o.id}: ${o.title}
`;
      output += `- **Type**: ${o.type}
`;
      output += `- **Project**: ${o.project}
`;
      output += `- **Date**: ${o.created_at}
`;
      if (o.text) output += `- **Content**: ${o.text}
`;
      if (o.narrative) output += `- **Narrative**: ${o.narrative}
`;
      if (o.concepts) output += `- **Concepts**: ${o.concepts}
`;
      if (o.files_read) output += `- **Files read**: ${o.files_read}
`;
      if (o.files_modified) output += `- **Files modified**: ${o.files_modified}
`;
      output += "\n";
    });
    return output;
  },
  async get_context(args) {
    const result = await callWorkerGET(`/api/context/${encodeURIComponent(args.project)}`);
    const obs = result.observations || [];
    const sums = result.summaries || [];
    let output = `## Context: ${args.project}

`;
    if (sums.length > 0) {
      output += `### Recent Summaries

`;
      sums.forEach((s) => {
        if (s.request) output += `**Request**: ${s.request}
`;
        if (s.learned) output += `- Learned: ${s.learned}
`;
        if (s.completed) output += `- Completed: ${s.completed}
`;
        if (s.next_steps) output += `- Next steps: ${s.next_steps}

`;
      });
    }
    if (obs.length > 0) {
      output += `### Recent Observations (${obs.length})

`;
      obs.slice(0, 10).forEach((o) => {
        output += `- **${o.title}** [${o.type}]: ${(o.text || "").substring(0, 100)}
`;
      });
    }
    return output;
  },
  async semantic_search(args) {
    const result = await callWorkerGET("/api/hybrid-search", {
      q: args.query,
      project: args.project || "",
      limit: String(args.limit || 10)
    });
    const hits = result.results || [];
    if (hits.length === 0) {
      return "No semantic results found for the query.";
    }
    let output = `## Semantic Search: "${args.query}"

`;
    output += `Found ${hits.length} results:

`;
    hits.forEach((h) => {
      const scorePercent = Math.round((h.score || 0) * 100);
      const source = h.source || "unknown";
      output += `- **#${h.id}** [${h.type}] ${h.title} (score: ${scorePercent}%, source: ${source})
`;
      if (h.content) output += `  ${h.content.substring(0, 150)}
`;
      output += "\n";
    });
    return output;
  },
  async embedding_stats() {
    const result = await callWorkerGET("/api/embeddings/stats");
    let output = `## Embedding Statistics

`;
    output += `- **Total observations**: ${result.total}
`;
    output += `- **With embeddings**: ${result.embedded}
`;
    output += `- **Coverage**: ${result.percentage}%
`;
    output += `- **Provider**: ${result.provider || "none"}
`;
    output += `- **Dimensions**: ${result.dimensions}
`;
    output += `- **Available**: ${result.available ? "yes" : "no"}
`;
    if (result.percentage < 100 && result.total > 0) {
      output += `
_Tip: Run \`kiro-memory embeddings backfill\` to generate missing embeddings._
`;
    }
    return output;
  },
  async store_knowledge(args) {
    const result = await callWorkerPOST("/api/knowledge", args);
    return `Knowledge stored successfully.
- **ID**: ${result.id}
- **Type**: ${result.knowledge_type}
- **Title**: ${args.title}`;
  },
  async resume_session(args) {
    let checkpoint;
    if (args.session_id) {
      checkpoint = await callWorkerGET(`/api/sessions/${args.session_id}/checkpoint`);
    } else {
      const project = args.project || process.env.KIRO_MEMORY_PROJECT || "";
      if (!project) {
        return "No project specified and unable to auto-detect. Provide a project name or session_id.";
      }
      checkpoint = await callWorkerGET("/api/checkpoint", { project });
    }
    if (!checkpoint || checkpoint.error) {
      return "No checkpoint found. There is no previous session to resume for this project.";
    }
    const parts = [
      `## Session Checkpoint \u2014 ${checkpoint.project}`,
      `**Task**: ${checkpoint.task}`
    ];
    if (checkpoint.progress) parts.push(`**Progress**: ${checkpoint.progress}`);
    if (checkpoint.next_steps) parts.push(`**Next Steps**: ${checkpoint.next_steps}`);
    if (checkpoint.open_questions) parts.push(`**Open Questions**: ${checkpoint.open_questions}`);
    if (checkpoint.relevant_files) parts.push(`**Relevant Files**: ${checkpoint.relevant_files}`);
    if (checkpoint.created_at) parts.push(`
_Checkpoint created: ${checkpoint.created_at}_`);
    return parts.join("\n");
  },
  async save_memory(args) {
    const result = await callWorkerPOST("/api/memory/save", {
      project: args.project,
      title: args.title,
      content: args.content,
      type: args.type || "research",
      concepts: args.concepts
    });
    return `Memory saved successfully.
- **ID**: ${result.id}
- **Project**: ${args.project}
- **Title**: ${args.title}`;
  },
  async generate_report(args) {
    const project = args.project || process.env.KIRO_MEMORY_PROJECT || "";
    const period = args.period === "monthly" ? "monthly" : "weekly";
    const params = { period, format: "markdown" };
    if (project) params.project = project;
    const result = await callWorkerGET("/api/report", params);
    if (typeof result === "string") return result;
    if (result?.error) return `Report generation failed: ${result.error}`;
    const d = result;
    const parts = [
      `# Activity Report \u2014 ${d.period?.label || period}`,
      `**Period**: ${d.period?.start} \u2192 ${d.period?.end} (${d.period?.days} days)`,
      "",
      "## Overview",
      `- Observations: ${d.overview?.observations || 0}`,
      `- Summaries: ${d.overview?.summaries || 0}`,
      `- Sessions: ${d.overview?.sessions || 0}`,
      `- Knowledge items: ${d.overview?.knowledgeCount || 0}`
    ];
    if (d.sessionStats?.total > 0) {
      const pct = Math.round(d.sessionStats.completed / d.sessionStats.total * 100);
      parts.push("", "## Sessions");
      parts.push(`- Total: ${d.sessionStats.total} | Completed: ${d.sessionStats.completed} (${pct}%)`);
      if (d.sessionStats.avgDurationMinutes > 0) {
        parts.push(`- Avg duration: ${d.sessionStats.avgDurationMinutes} min`);
      }
    }
    if (d.topLearnings?.length > 0) {
      parts.push("", "## Key Learnings");
      d.topLearnings.forEach((l) => parts.push(`- ${l}`));
    }
    if (d.completedTasks?.length > 0) {
      parts.push("", "## Completed");
      d.completedTasks.forEach((t) => parts.push(`- ${t}`));
    }
    if (d.nextSteps?.length > 0) {
      parts.push("", "## Next Steps");
      d.nextSteps.forEach((s) => parts.push(`- ${s}`));
    }
    if (d.fileHotspots?.length > 0) {
      parts.push("", "## File Hotspots");
      d.fileHotspots.slice(0, 10).forEach((f) => parts.push(`- \`${f.file}\` (${f.count}x)`));
    }
    return parts.join("\n");
  }
};
async function main() {
  const server = new Server(
    { name: "kiro-memory", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const handler = handlers[name];
    if (!handler) {
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true
      };
    }
    try {
      const result = await handler(args || {});
      return {
        content: [{ type: "text", text: result }]
      };
    } catch (error) {
      const msg = error?.message || String(error);
      if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
        return {
          content: [{
            type: "text",
            text: `Kiro Memory worker unreachable at ${WORKER_BASE}.
Start the worker with: cd <kiro-memory-dir> && npm run worker:start`
          }],
          isError: true
        };
      }
      const safeMsg = msg.includes("Worker") ? "Worker communication error" : "Internal error processing request";
      return {
        content: [{ type: "text", text: `Error: ${safeMsg}` }],
        isError: true
      };
    }
  });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.log("Kiro Memory MCP server started on stdio");
}
main().catch((err) => {
  console.error("MCP server startup error:", err);
  process.exit(1);
});
