/**
 * Keyset pagination cursor per Kiro Memory.
 *
 * Il cursor codifica in base64 la coppia (created_at_epoch, id) che identifica
 * univocamente l'ultima riga restituita dalla pagina precedente.
 * Il formato interno è: `<epoch>:<id>` — entrambi interi positivi.
 *
 * Utilizzo SQL:
 *   WHERE (created_at_epoch, id) < (?, ?)
 *   ORDER BY created_at_epoch DESC, id DESC
 *   LIMIT ?
 */

/** Struttura decodificata di un cursor */
export interface DecodedCursor {
  epoch: number;
  id: number;
}

/**
 * Codifica un cursor a partire da epoch e id dell'ultimo elemento della pagina.
 * Restituisce una stringa base64 URL-safe.
 */
export function encodeCursor(id: number, epoch: number): string {
  const raw = `${epoch}:${id}`;
  return Buffer.from(raw, 'utf8').toString('base64url');
}

/**
 * Decodifica un cursor base64 nella coppia {epoch, id}.
 * Restituisce null se il formato è invalido o i valori non sono interi positivi.
 */
export function decodeCursor(cursor: string): DecodedCursor | null {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const colonIdx = raw.indexOf(':');
    if (colonIdx === -1) return null;

    const epochStr = raw.substring(0, colonIdx);
    const idStr = raw.substring(colonIdx + 1);

    const epoch = parseInt(epochStr, 10);
    const id = parseInt(idStr, 10);

    // Entrambi devono essere interi positivi validi
    if (!Number.isInteger(epoch) || epoch <= 0) return null;
    if (!Number.isInteger(id) || id <= 0) return null;

    return { epoch, id };
  } catch {
    return null;
  }
}

/**
 * Parametri di input per una query paginata con keyset.
 */
export interface KeysetPageParams {
  /** Cursor opaco (base64) dall'ultima risposta. Null = prima pagina. */
  cursor: string | null;
  /** Numero di elementi per pagina (default 50, max 200). */
  limit: number;
  /** Filtro opzionale per progetto. */
  project?: string;
}

/**
 * Risposta standardizzata per endpoint con keyset pagination.
 */
export interface KeysetPageResult<T> {
  /** Elementi della pagina corrente */
  data: T[];
  /** Cursor da passare alla prossima richiesta. Null se non ci sono più pagine. */
  next_cursor: string | null;
  /** true se esiste almeno un'altra pagina oltre questa */
  has_more: boolean;
}

/**
 * Costruisce il cursor per il prossimo fetch a partire dall'ultimo elemento della pagina.
 * Restituisce null se la lista è vuota o manca di campi necessari.
 */
export function buildNextCursor<T extends { id: number; created_at_epoch: number }>(
  rows: T[],
  limit: number
): string | null {
  // Se la pagina è piena (length === limit), ci sono probabilmente altre righe
  if (rows.length < limit) return null;

  const last = rows[rows.length - 1];
  if (!last) return null;

  return encodeCursor(last.id, last.created_at_epoch);
}
