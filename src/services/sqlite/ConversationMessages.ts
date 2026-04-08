import type { Database } from '../../db/types.js';
import type { ConversationMessage } from '../../types/worker-types.js';

/**
 * Operazioni SQLite per i messaggi conversazionali completi di una sessione.
 */
export function createConversationMessage(
  db: Database,
  contentSessionId: string,
  project: string,
  role: ConversationMessage['role'],
  messageIndex: number,
  content: string,
  createdAt?: string,
  createdAtEpoch?: number
): number {
  const timestamp = createdAt || new Date().toISOString();
  const epoch = createdAtEpoch ?? Date.now();
  const result = db.run(
    `INSERT OR IGNORE INTO conversation_messages
     (content_session_id, project, role, message_index, content, created_at, created_at_epoch)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [contentSessionId, project, role, messageIndex, content, timestamp, epoch]
  );
  return Number(result.lastInsertRowid || 0);
}

export function getConversationMessagesBySession(
  db: Database,
  contentSessionId: string
): ConversationMessage[] {
  const query = db.query(
    `SELECT * FROM conversation_messages
     WHERE content_session_id = ?
     ORDER BY message_index ASC, id ASC`
  );
  return query.all(contentSessionId) as ConversationMessage[];
}

export function getConversationMessageCountBySession(
  db: Database,
  contentSessionId: string
): number {
  const query = db.query(
    'SELECT COUNT(*) as total FROM conversation_messages WHERE content_session_id = ?'
  );
  const result = query.get(contentSessionId) as { total: number } | null;
  return result?.total || 0;
}
