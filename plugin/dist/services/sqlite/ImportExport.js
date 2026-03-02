import { createRequire } from 'module';const require = createRequire(import.meta.url);

// src/services/sqlite/ImportExport.ts
import { createHash } from "crypto";
var JSONL_SCHEMA_VERSION = "2.5.0";
var IMPORT_BATCH_SIZE = 100;
function countExportRecords(db, filters) {
  const { fromEpoch, toEpoch } = filtersToEpoch(filters);
  const obsConds = buildConditions({ project: filters.project, type: filters.type, fromEpoch, toEpoch });
  const sumConds = buildConditions({ project: filters.project, fromEpoch, toEpoch });
  const promptConds = buildConditions({ project: filters.project, fromEpoch, toEpoch });
  const obsCount = db.query(
    `SELECT COUNT(*) as c FROM observations WHERE ${obsConds.where}`
  ).get(...obsConds.params).c;
  const sumCount = db.query(
    `SELECT COUNT(*) as c FROM summaries WHERE ${sumConds.where}`
  ).get(...sumConds.params).c;
  const promptCount = db.query(
    `SELECT COUNT(*) as c FROM prompts WHERE ${promptConds.where}`
  ).get(...promptConds.params).c;
  return { observations: obsCount, summaries: sumCount, prompts: promptCount };
}
function generateMetaRecord(db, filters) {
  const counts = countExportRecords(db, filters);
  const meta = {
    _meta: {
      version: JSONL_SCHEMA_VERSION,
      exported_at: (/* @__PURE__ */ new Date()).toISOString(),
      counts,
      filters: Object.keys(filters).length > 0 ? filters : void 0
    }
  };
  return JSON.stringify(meta);
}
function exportObservationsStreaming(db, filters, onRow, batchSize = 200) {
  const { fromEpoch, toEpoch } = filtersToEpoch(filters);
  const conds = buildConditions({ project: filters.project, type: filters.type, fromEpoch, toEpoch });
  let offset = 0;
  let total = 0;
  while (true) {
    const rows = db.query(
      `SELECT id, memory_session_id, project, type, title, subtitle, text, narrative, facts, concepts,
              files_read, files_modified, prompt_number, content_hash, discovery_tokens, auto_category,
              created_at, created_at_epoch
       FROM observations
       WHERE ${conds.where}
       ORDER BY created_at_epoch ASC, id ASC
       LIMIT ? OFFSET ?`
    ).all(...conds.params, batchSize, offset);
    if (rows.length === 0) break;
    for (const row of rows) {
      const record = {
        _type: "observation",
        id: row.id,
        memory_session_id: row.memory_session_id,
        project: row.project,
        type: row.type,
        title: row.title,
        subtitle: row.subtitle,
        text: row.text,
        narrative: row.narrative,
        facts: row.facts,
        concepts: row.concepts,
        files_read: row.files_read,
        files_modified: row.files_modified,
        prompt_number: row.prompt_number,
        content_hash: row.content_hash,
        discovery_tokens: row.discovery_tokens ?? 0,
        auto_category: row.auto_category,
        created_at: row.created_at,
        created_at_epoch: row.created_at_epoch
      };
      onRow(JSON.stringify(record));
      total++;
    }
    offset += rows.length;
    if (rows.length < batchSize) break;
  }
  return total;
}
function exportSummariesStreaming(db, filters, onRow, batchSize = 200) {
  const { fromEpoch, toEpoch } = filtersToEpoch(filters);
  const conds = buildConditions({ project: filters.project, fromEpoch, toEpoch });
  let offset = 0;
  let total = 0;
  while (true) {
    const rows = db.query(
      `SELECT id, session_id, project, request, investigated, learned, completed, next_steps, notes,
              discovery_tokens, created_at, created_at_epoch
       FROM summaries
       WHERE ${conds.where}
       ORDER BY created_at_epoch ASC, id ASC
       LIMIT ? OFFSET ?`
    ).all(...conds.params, batchSize, offset);
    if (rows.length === 0) break;
    for (const row of rows) {
      const record = {
        _type: "summary",
        id: row.id,
        session_id: row.session_id,
        project: row.project,
        request: row.request,
        investigated: row.investigated,
        learned: row.learned,
        completed: row.completed,
        next_steps: row.next_steps,
        notes: row.notes,
        discovery_tokens: row.discovery_tokens ?? 0,
        created_at: row.created_at,
        created_at_epoch: row.created_at_epoch
      };
      onRow(JSON.stringify(record));
      total++;
    }
    offset += rows.length;
    if (rows.length < batchSize) break;
  }
  return total;
}
function exportPromptsStreaming(db, filters, onRow, batchSize = 200) {
  const { fromEpoch, toEpoch } = filtersToEpoch(filters);
  const conds = buildConditions({ project: filters.project, fromEpoch, toEpoch });
  let offset = 0;
  let total = 0;
  while (true) {
    const rows = db.query(
      `SELECT id, content_session_id, project, prompt_number, prompt_text, created_at, created_at_epoch
       FROM prompts
       WHERE ${conds.where}
       ORDER BY created_at_epoch ASC, id ASC
       LIMIT ? OFFSET ?`
    ).all(...conds.params, batchSize, offset);
    if (rows.length === 0) break;
    for (const row of rows) {
      const record = {
        _type: "prompt",
        id: row.id,
        content_session_id: row.content_session_id,
        project: row.project,
        prompt_number: row.prompt_number,
        prompt_text: row.prompt_text,
        created_at: row.created_at,
        created_at_epoch: row.created_at_epoch
      };
      onRow(JSON.stringify(record));
      total++;
    }
    offset += rows.length;
    if (rows.length < batchSize) break;
  }
  return total;
}
function validateJsonlRow(raw) {
  if (!raw || typeof raw !== "object") {
    return "Il record non \xE8 un oggetto JSON valido";
  }
  const rec = raw;
  if ("_meta" in rec) return null;
  const validTypes = ["observation", "summary", "prompt"];
  if (!rec._type || typeof rec._type !== "string" || !validTypes.includes(rec._type)) {
    return `Campo "_type" obbligatorio, uno di: ${validTypes.join(", ")}`;
  }
  if (rec._type === "observation") {
    if (!rec.project || typeof rec.project !== "string") return 'observation: campo "project" obbligatorio';
    if (!rec.type || typeof rec.type !== "string") return 'observation: campo "type" obbligatorio';
    if (!rec.title || typeof rec.title !== "string") return 'observation: campo "title" obbligatorio';
    if (rec.project.length > 200) return 'observation: "project" troppo lungo (max 200)';
    if (rec.title.length > 500) return 'observation: "title" troppo lungo (max 500)';
  } else if (rec._type === "summary") {
    if (!rec.project || typeof rec.project !== "string") return 'summary: campo "project" obbligatorio';
    if (!rec.session_id || typeof rec.session_id !== "string") return 'summary: campo "session_id" obbligatorio';
  } else if (rec._type === "prompt") {
    if (!rec.project || typeof rec.project !== "string") return 'prompt: campo "project" obbligatorio';
    if (!rec.content_session_id || typeof rec.content_session_id !== "string") return 'prompt: campo "content_session_id" obbligatorio';
    if (!rec.prompt_text || typeof rec.prompt_text !== "string") return 'prompt: campo "prompt_text" obbligatorio';
  }
  return null;
}
function computeImportHash(rec) {
  const payload = [
    rec.project ?? "",
    rec.type ?? "",
    rec.title ?? "",
    rec.narrative ?? ""
  ].join("|");
  return createHash("sha256").update(payload).digest("hex");
}
function hashExistsInObservations(db, hash) {
  const result = db.query(
    "SELECT id FROM observations WHERE content_hash = ? LIMIT 1"
  ).get(hash);
  return !!result;
}
function importObservationBatch(db, records, dryRun) {
  let imported = 0;
  let skipped = 0;
  for (let i = 0; i < records.length; i += IMPORT_BATCH_SIZE) {
    const batch = records.slice(i, i + IMPORT_BATCH_SIZE);
    if (dryRun) {
      for (const rec of batch) {
        const hash = rec.content_hash || computeImportHash(rec);
        if (hashExistsInObservations(db, hash)) {
          skipped++;
        } else {
          imported++;
        }
      }
      continue;
    }
    const insertBatch = db.transaction(() => {
      for (const rec of batch) {
        const hash = rec.content_hash || computeImportHash(rec);
        if (hashExistsInObservations(db, hash)) {
          skipped++;
          continue;
        }
        const now = (/* @__PURE__ */ new Date()).toISOString();
        db.run(
          `INSERT INTO observations
           (memory_session_id, project, type, title, subtitle, text, narrative, facts, concepts,
            files_read, files_modified, prompt_number, content_hash, discovery_tokens, auto_category,
            created_at, created_at_epoch)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            rec.memory_session_id || "imported",
            rec.project,
            rec.type,
            rec.title,
            rec.subtitle ?? null,
            rec.text ?? null,
            rec.narrative ?? null,
            rec.facts ?? null,
            rec.concepts ?? null,
            rec.files_read ?? null,
            rec.files_modified ?? null,
            rec.prompt_number ?? 0,
            hash,
            rec.discovery_tokens ?? 0,
            rec.auto_category ?? null,
            rec.created_at || now,
            rec.created_at_epoch || Date.now()
          ]
        );
        imported++;
      }
    });
    insertBatch();
  }
  return { imported, skipped };
}
function importSummaryBatch(db, records, dryRun) {
  let imported = 0;
  let skipped = 0;
  for (let i = 0; i < records.length; i += IMPORT_BATCH_SIZE) {
    const batch = records.slice(i, i + IMPORT_BATCH_SIZE);
    if (dryRun) {
      for (const rec of batch) {
        const exists = db.query(
          "SELECT id FROM summaries WHERE session_id = ? AND project = ? AND created_at_epoch = ? LIMIT 1"
        ).get(rec.session_id, rec.project, rec.created_at_epoch ?? 0);
        if (exists) skipped++;
        else imported++;
      }
      continue;
    }
    const insertBatch = db.transaction(() => {
      for (const rec of batch) {
        const exists = db.query(
          "SELECT id FROM summaries WHERE session_id = ? AND project = ? AND created_at_epoch = ? LIMIT 1"
        ).get(rec.session_id, rec.project, rec.created_at_epoch ?? 0);
        if (exists) {
          skipped++;
          continue;
        }
        const now = (/* @__PURE__ */ new Date()).toISOString();
        db.run(
          `INSERT INTO summaries
           (session_id, project, request, investigated, learned, completed, next_steps, notes,
            discovery_tokens, created_at, created_at_epoch)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            rec.session_id,
            rec.project,
            rec.request ?? null,
            rec.investigated ?? null,
            rec.learned ?? null,
            rec.completed ?? null,
            rec.next_steps ?? null,
            rec.notes ?? null,
            rec.discovery_tokens ?? 0,
            rec.created_at || now,
            rec.created_at_epoch || Date.now()
          ]
        );
        imported++;
      }
    });
    insertBatch();
  }
  return { imported, skipped };
}
function importPromptBatch(db, records, dryRun) {
  let imported = 0;
  let skipped = 0;
  for (let i = 0; i < records.length; i += IMPORT_BATCH_SIZE) {
    const batch = records.slice(i, i + IMPORT_BATCH_SIZE);
    if (dryRun) {
      for (const rec of batch) {
        const exists = db.query(
          "SELECT id FROM prompts WHERE content_session_id = ? AND prompt_number = ? LIMIT 1"
        ).get(rec.content_session_id, rec.prompt_number ?? 0);
        if (exists) skipped++;
        else imported++;
      }
      continue;
    }
    const insertBatch = db.transaction(() => {
      for (const rec of batch) {
        const exists = db.query(
          "SELECT id FROM prompts WHERE content_session_id = ? AND prompt_number = ? LIMIT 1"
        ).get(rec.content_session_id, rec.prompt_number ?? 0);
        if (exists) {
          skipped++;
          continue;
        }
        const now = (/* @__PURE__ */ new Date()).toISOString();
        db.run(
          `INSERT INTO prompts
           (content_session_id, project, prompt_number, prompt_text, created_at, created_at_epoch)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            rec.content_session_id,
            rec.project,
            rec.prompt_number ?? 0,
            rec.prompt_text,
            rec.created_at || now,
            rec.created_at_epoch || Date.now()
          ]
        );
        imported++;
      }
    });
    insertBatch();
  }
  return { imported, skipped };
}
function importJsonl(db, content, dryRun = false) {
  const lines = content.split("\n");
  const result = {
    imported: 0,
    skipped: 0,
    errors: 0,
    total: 0,
    errorDetails: []
  };
  const obsBuf = [];
  const sumBuf = [];
  const promptBuf = [];
  const flushBuffers = () => {
    if (obsBuf.length > 0) {
      const r = importObservationBatch(db, obsBuf.splice(0), dryRun);
      result.imported += r.imported;
      result.skipped += r.skipped;
    }
    if (sumBuf.length > 0) {
      const r = importSummaryBatch(db, sumBuf.splice(0), dryRun);
      result.imported += r.imported;
      result.skipped += r.skipped;
    }
    if (promptBuf.length > 0) {
      const r = importPromptBatch(db, promptBuf.splice(0), dryRun);
      result.imported += r.imported;
      result.skipped += r.skipped;
    }
  };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw || raw.startsWith("#")) continue;
    result.total++;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      result.errors++;
      result.errorDetails.push({ line: i + 1, error: `JSON non valido: ${raw.substring(0, 60)}` });
      continue;
    }
    if (parsed && typeof parsed === "object" && "_meta" in parsed) {
      result.total--;
      continue;
    }
    const validErr = validateJsonlRow(parsed);
    if (validErr) {
      result.errors++;
      result.errorDetails.push({ line: i + 1, error: validErr });
      continue;
    }
    const rec = parsed;
    if (rec._type === "observation") {
      obsBuf.push(rec);
    } else if (rec._type === "summary") {
      sumBuf.push(rec);
    } else if (rec._type === "prompt") {
      promptBuf.push(rec);
    }
    const totalBuf = obsBuf.length + sumBuf.length + promptBuf.length;
    if (totalBuf >= IMPORT_BATCH_SIZE) {
      flushBuffers();
    }
  }
  flushBuffers();
  return result;
}
function filtersToEpoch(filters) {
  return {
    fromEpoch: filters.from ? new Date(filters.from).getTime() : void 0,
    toEpoch: filters.to ? new Date(filters.to).getTime() : void 0
  };
}
function buildConditions(params) {
  const conditions = ["1=1"];
  const values = [];
  if (params.project) {
    conditions.push("project = ?");
    values.push(params.project);
  }
  if (params.type) {
    conditions.push("type = ?");
    values.push(params.type);
  }
  if (params.fromEpoch !== void 0) {
    conditions.push("created_at_epoch >= ?");
    values.push(params.fromEpoch);
  }
  if (params.toEpoch !== void 0) {
    conditions.push("created_at_epoch <= ?");
    values.push(params.toEpoch);
  }
  return { where: conditions.join(" AND "), params: values };
}
export {
  JSONL_SCHEMA_VERSION,
  computeImportHash,
  countExportRecords,
  exportObservationsStreaming,
  exportPromptsStreaming,
  exportSummariesStreaming,
  generateMetaRecord,
  hashExistsInObservations,
  importJsonl,
  validateJsonlRow
};
