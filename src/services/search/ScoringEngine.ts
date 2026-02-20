/**
 * Motore di scoring per ranking intelligente
 *
 * Funzioni pure senza dipendenze DB. Combina 4 segnali:
 * - semantic: cosine similarity dall'embedding
 * - fts5: rank FTS5 normalizzato
 * - recency: decadimento esponenziale basato sull'eta
 * - projectMatch: 1 se progetto corrisponde, 0 altrimenti
 */

import type { ScoringWeights } from '../../types/worker-types.js';

/** Pesi per modalita ricerca (con query testuale) */
export const SEARCH_WEIGHTS: ScoringWeights = {
  semantic: 0.4,
  fts5: 0.3,
  recency: 0.2,
  projectMatch: 0.1
};

/** Pesi per modalita contesto (senza query, es. agentSpawn) */
export const CONTEXT_WEIGHTS: ScoringWeights = {
  semantic: 0.0,
  fts5: 0.0,
  recency: 0.7,
  projectMatch: 0.3
};

/**
 * Calcola score di recency con decadimento esponenziale.
 * Piu recente = piu alto (vicino a 1). Dopo halfLifeHours lo score e ~0.5.
 *
 * @param createdAtEpoch - Timestamp di creazione in millisecondi
 * @param halfLifeHours - Tempo di dimezzamento in ore (default: 168 = 7 giorni)
 * @returns Score 0-1
 */
export function recencyScore(createdAtEpoch: number, halfLifeHours: number = 168): number {
  if (!createdAtEpoch || createdAtEpoch <= 0) return 0;

  const nowMs = Date.now();
  const ageMs = nowMs - createdAtEpoch;

  // Se timestamp nel futuro, score massimo
  if (ageMs <= 0) return 1;

  const ageHours = ageMs / (1000 * 60 * 60);

  // Decadimento esponenziale: exp(-age * ln(2) / halfLife)
  return Math.exp(-ageHours * Math.LN2 / halfLifeHours);
}

/**
 * Normalizza un rank FTS5 grezzo in range 0-1.
 * FTS5 rank e negativo: piu negativo = piu rilevante.
 * Normalizzazione min-max rispetto a tutti i rank nel batch.
 *
 * @param rank - Rank FTS5 grezzo (negativo)
 * @param allRanks - Tutti i rank del batch per normalizzazione
 * @returns Score 0-1 (1 = piu rilevante)
 */
export function normalizeFTS5Rank(rank: number, allRanks: number[]): number {
  if (allRanks.length === 0) return 0;
  if (allRanks.length === 1) return 1; // Un solo risultato: massima rilevanza

  const minRank = Math.min(...allRanks); // Piu negativo = migliore
  const maxRank = Math.max(...allRanks); // Meno negativo = peggiore

  // Se tutti uguali, ritorna 1
  if (minRank === maxRank) return 1;

  // Inverti: il piu negativo diventa 1, il meno negativo diventa 0
  return (maxRank - rank) / (maxRank - minRank);
}

/**
 * Score binario per corrispondenza progetto.
 *
 * @param itemProject - Progetto dell'item
 * @param targetProject - Progetto target (es. progetto corrente)
 * @returns 1 se corrispondono, 0 altrimenti
 */
export function projectMatchScore(itemProject: string, targetProject: string): number {
  if (!itemProject || !targetProject) return 0;
  return itemProject.toLowerCase() === targetProject.toLowerCase() ? 1 : 0;
}

/**
 * Calcola score composito pesato combinando i 4 segnali.
 *
 * @param signals - Valori dei 4 segnali (ciascuno 0-1)
 * @param weights - Pesi per ciascun segnale
 * @returns Score composito 0-1
 */
export function computeCompositeScore(
  signals: {
    semantic: number;
    fts5: number;
    recency: number;
    projectMatch: number;
  },
  weights: ScoringWeights
): number {
  return (
    signals.semantic * weights.semantic +
    signals.fts5 * weights.fts5 +
    signals.recency * weights.recency +
    signals.projectMatch * weights.projectMatch
  );
}

/**
 * Score di recency basato sull'ultimo accesso (ricerca che ha trovato l'osservazione).
 * Usa half-life piu breve rispetto a recencyScore() perche l'accesso e piu volatile.
 *
 * Se l'osservazione non e mai stata acceduta, ritorna 0 (penalita massima).
 *
 * @param lastAccessedEpoch - Timestamp dell'ultimo accesso in millisecondi (null se mai acceduta)
 * @param halfLifeHours - Tempo di dimezzamento in ore (default: 48 = 2 giorni)
 * @returns Score 0-1 (1 = acceduta di recente)
 */
export function accessRecencyScore(lastAccessedEpoch: number | null, halfLifeHours: number = 48): number {
  if (!lastAccessedEpoch || lastAccessedEpoch <= 0) return 0;

  const nowMs = Date.now();
  const ageMs = nowMs - lastAccessedEpoch;

  // Se timestamp nel futuro, score massimo
  if (ageMs <= 0) return 1;

  const ageHours = ageMs / (1000 * 60 * 60);
  return Math.exp(-ageHours * Math.LN2 / halfLifeHours);
}

/**
 * Penalita per osservazioni stale (file modificati dopo l'osservazione).
 * Ritorna un moltiplicatore: 1.0 se fresh, 0.5 se stale.
 * Non elimina l'osservazione dal ranking ma la penalizza significativamente.
 *
 * @param isStale - Flag stale (0 = fresh, 1 = stale)
 * @returns Moltiplicatore 0.5-1.0
 */
export function stalenessPenalty(isStale: number): number {
  return isStale === 1 ? 0.5 : 1.0;
}

/**
 * Boost moltiplicativo per tipi di conoscenza strutturata.
 * Constraint e decision pesano di piu perche rappresentano regole e scelte critiche.
 * Tipi non-knowledge restano a 1.0 (nessun boost).
 */
export const KNOWLEDGE_TYPE_BOOST: Record<string, number> = {
  constraint: 1.30,
  decision: 1.25,
  heuristic: 1.15,
  rejected: 1.10
};

/**
 * Ritorna il moltiplicatore di boost per il tipo di osservazione.
 * Tipi knowledge ottengono un boost, tutti gli altri restano a 1.0.
 *
 * @param type - Tipo dell'osservazione
 * @returns Moltiplicatore >= 1.0
 */
export function knowledgeTypeBoost(type: string): number {
  return KNOWLEDGE_TYPE_BOOST[type] ?? 1.0;
}

/**
 * Stima approssimativa dei token da una stringa.
 * Usa la regola empirica: 1 token ≈ 4 caratteri.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}
