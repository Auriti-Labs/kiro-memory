/**
 * Kiro Memory — Algoritmo diff basato su LCS (Longest Common Subsequence)
 *
 * Implementazione pura senza dipendenze esterne.
 * Produce un array di DiffChunk compatibile con il componente DiffViewer.
 */

import type { DiffChunk } from '../types';

// ============================================================================
// Algoritmo LCS — programmazione dinamica O(n*m)
// ============================================================================

/**
 * Calcola la matrice LCS tra due array di stringhe.
 * Restituisce la lunghezza massima di sottosequenza comune per ogni coppia (i,j).
 */
function buildLCSMatrix(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  // Alloca matrice (m+1) x (n+1) inizializzata a 0
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  return dp;
}

/**
 * Percorre la matrice LCS all'indietro e produce la sequenza di operazioni diff.
 * Operazioni: 'equal' | 'remove' (da sinistra) | 'add' (da destra)
 */
function tracebackLCS(
  dp: number[][],
  a: string[],
  b: string[],
  i: number,
  j: number,
  result: Array<{ op: 'equal' | 'remove' | 'add'; line: string }>
): void {
  // Caso base: una delle sequenze è esaurita
  if (i === 0 && j === 0) return;
  if (i === 0) {
    // Rimangono solo righe di b → tutte aggiunte
    tracebackLCS(dp, a, b, i, j - 1, result);
    result.push({ op: 'add', line: b[j - 1] });
    return;
  }
  if (j === 0) {
    // Rimangono solo righe di a → tutte rimosse
    tracebackLCS(dp, a, b, i - 1, j, result);
    result.push({ op: 'remove', line: a[i - 1] });
    return;
  }

  if (a[i - 1] === b[j - 1]) {
    // Corrispondenza esatta → uguale
    tracebackLCS(dp, a, b, i - 1, j - 1, result);
    result.push({ op: 'equal', line: a[i - 1] });
  } else if (dp[i - 1][j] >= dp[i][j - 1]) {
    // Privilegia la rimozione rispetto all'aggiunta
    tracebackLCS(dp, a, b, i - 1, j, result);
    result.push({ op: 'remove', line: a[i - 1] });
  } else {
    tracebackLCS(dp, a, b, i, j - 1, result);
    result.push({ op: 'add', line: b[j - 1] });
  }
}

// ============================================================================
// Raggruppamento in DiffChunk
// ============================================================================

/**
 * Raggruppa operazioni consecutive dello stesso tipo in blocchi (DiffChunk).
 * Calcola i numeri di riga separatamente per il pannello sinistro (before)
 * e destro (after).
 */
function groupIntoChunks(
  ops: Array<{ op: 'equal' | 'remove' | 'add'; line: string }>
): DiffChunk[] {
  const chunks: DiffChunk[] = [];
  let leftLine = 1;  // contatore righe pannello sinistro (before)
  let rightLine = 1; // contatore righe pannello destro (after)

  let i = 0;
  while (i < ops.length) {
    const currentOp = ops[i].op;
    const lines: string[] = [];
    const chunkLeftStart = currentOp !== 'add' ? leftLine : -1;
    const chunkRightStart = currentOp !== 'remove' ? rightLine : -1;

    // Raccoglie tutte le operazioni consecutive dello stesso tipo
    while (i < ops.length && ops[i].op === currentOp) {
      lines.push(ops[i].line);
      if (currentOp === 'equal') {
        leftLine++;
        rightLine++;
      } else if (currentOp === 'remove') {
        leftLine++;
      } else {
        rightLine++;
      }
      i++;
    }

    const type: DiffChunk['type'] =
      currentOp === 'equal' ? 'equal' :
      currentOp === 'remove' ? 'remove' : 'add';

    chunks.push({
      type,
      lines,
      leftStart: chunkLeftStart,
      rightStart: chunkRightStart,
    });
  }

  return chunks;
}

// ============================================================================
// API pubblica
// ============================================================================

/**
 * Calcola il diff tra due stringhe multi-riga.
 *
 * @param before - Testo originale (pannello sinistro)
 * @param after  - Testo modificato (pannello destro)
 * @returns Array di DiffChunk pronto per DiffViewer
 *
 * @example
 * const chunks = computeDiff('const x = 1;\n', 'const x = 2;\n');
 */
export function computeDiff(before: string, after: string): DiffChunk[] {
  const aLines = before.split('\n');
  const bLines = after.split('\n');

  // Rimuove l'ultima riga vuota prodotta dal split se la stringa termina con \n
  if (aLines[aLines.length - 1] === '') aLines.pop();
  if (bLines[bLines.length - 1] === '') bLines.pop();

  // Gestisce casi degeneri
  if (aLines.length === 0 && bLines.length === 0) return [];
  if (aLines.length === 0) {
    return [{ type: 'add', lines: bLines, leftStart: -1, rightStart: 1 }];
  }
  if (bLines.length === 0) {
    return [{ type: 'remove', lines: aLines, leftStart: 1, rightStart: -1 }];
  }

  // Calcola LCS e traccia il percorso
  const dp = buildLCSMatrix(aLines, bLines);
  const ops: Array<{ op: 'equal' | 'remove' | 'add'; line: string }> = [];
  tracebackLCS(dp, aLines, bLines, aLines.length, bLines.length, ops);

  return groupIntoChunks(ops);
}

/**
 * Conta il numero di linee aggiunte e rimosse in un array di chunk.
 * Utile per visualizzare il riassunto delle modifiche (+X -Y).
 */
export function countDiffStats(chunks: DiffChunk[]): { added: number; removed: number; unchanged: number } {
  let added = 0;
  let removed = 0;
  let unchanged = 0;
  for (const chunk of chunks) {
    if (chunk.type === 'add') added += chunk.lines.length;
    else if (chunk.type === 'remove') removed += chunk.lines.length;
    else unchanged += chunk.lines.length;
  }
  return { added, removed, unchanged };
}

/**
 * Restituisce gli indici dei chunk con modifiche (non 'equal').
 * Usato dai bottoni "Prossima modifica" / "Modifica precedente".
 */
export function getChangeIndices(chunks: DiffChunk[]): number[] {
  return chunks
    .map((c, i) => (c.type !== 'equal' ? i : -1))
    .filter(i => i !== -1);
}
