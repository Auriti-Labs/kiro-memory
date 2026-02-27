/**
 * Test suite per l'algoritmo diff (issue #22)
 *
 * Copre: computeDiff, countDiffStats, getChangeIndices
 */

import { describe, it, expect } from 'bun:test';
import { computeDiff, countDiffStats, getChangeIndices } from '../../src/ui/viewer/utils/diff.js';

// ============================================================================
// computeDiff — test di base
// ============================================================================

describe('computeDiff', () => {
  it('dovrebbe restituire array vuoto per due stringhe identiche vuote', () => {
    const chunks = computeDiff('', '');
    expect(chunks).toEqual([]);
  });

  it('dovrebbe produrre chunk equal per stringhe identiche', () => {
    const text = 'riga1\nriga2\nriga3';
    const chunks = computeDiff(text, text);
    expect(chunks.every(c => c.type === 'equal')).toBe(true);
    const allLines = chunks.flatMap(c => c.lines);
    expect(allLines).toEqual(['riga1', 'riga2', 'riga3']);
  });

  it('dovrebbe rilevare una riga aggiunta', () => {
    const before = 'riga1\nriga3';
    const after = 'riga1\nriga2\nriga3';
    const chunks = computeDiff(before, after);
    const addChunks = chunks.filter(c => c.type === 'add');
    expect(addChunks.length).toBeGreaterThan(0);
    const addedLines = addChunks.flatMap(c => c.lines);
    expect(addedLines).toContain('riga2');
  });

  it('dovrebbe rilevare una riga rimossa', () => {
    const before = 'riga1\nriga2\nriga3';
    const after = 'riga1\nriga3';
    const chunks = computeDiff(before, after);
    const removeChunks = chunks.filter(c => c.type === 'remove');
    expect(removeChunks.length).toBeGreaterThan(0);
    const removedLines = removeChunks.flatMap(c => c.lines);
    expect(removedLines).toContain('riga2');
  });

  it('dovrebbe rilevare una riga modificata (remove + add)', () => {
    const before = 'const x = 1;';
    const after = 'const x = 2;';
    const chunks = computeDiff(before, after);
    const types = chunks.map(c => c.type);
    // Una riga modificata produce remove + add (nessuna equal in questo caso)
    expect(types).toContain('remove');
    expect(types).toContain('add');
  });

  it('dovrebbe gestire before vuoto (tutte aggiunte)', () => {
    const chunks = computeDiff('', 'linea1\nlinea2');
    expect(chunks.length).toBe(1);
    expect(chunks[0].type).toBe('add');
    expect(chunks[0].lines).toEqual(['linea1', 'linea2']);
    expect(chunks[0].leftStart).toBe(-1);
    expect(chunks[0].rightStart).toBe(1);
  });

  it('dovrebbe gestire after vuoto (tutte rimosse)', () => {
    const chunks = computeDiff('linea1\nlinea2', '');
    expect(chunks.length).toBe(1);
    expect(chunks[0].type).toBe('remove');
    expect(chunks[0].lines).toEqual(['linea1', 'linea2']);
    expect(chunks[0].leftStart).toBe(1);
    expect(chunks[0].rightStart).toBe(-1);
  });

  it('dovrebbe assegnare numeri di riga corretti per le righe equal', () => {
    const before = 'a\nb\nc';
    const after = 'a\nb\nc';
    const chunks = computeDiff(before, after);
    // Tutto uguale: il primo chunk equal deve iniziare a riga 1
    expect(chunks[0].leftStart).toBe(1);
    expect(chunks[0].rightStart).toBe(1);
  });

  it('dovrebbe assegnare leftStart = -1 per chunk add', () => {
    const before = 'a\nc';
    const after = 'a\nb\nc';
    const chunks = computeDiff(before, after);
    const addChunk = chunks.find(c => c.type === 'add');
    expect(addChunk).toBeDefined();
    expect(addChunk!.leftStart).toBe(-1);
  });

  it('dovrebbe assegnare rightStart = -1 per chunk remove', () => {
    const before = 'a\nb\nc';
    const after = 'a\nc';
    const chunks = computeDiff(before, after);
    const removeChunk = chunks.find(c => c.type === 'remove');
    expect(removeChunk).toBeDefined();
    expect(removeChunk!.rightStart).toBe(-1);
  });

  it('dovrebbe gestire testo multi-blocco con aggiunte e rimozioni miste', () => {
    const before = 'import A\nconst x = 1;\nexport default x;';
    const after = 'import A\nimport B\nconst x = 2;\nexport default x;';
    const chunks = computeDiff(before, after);
    const stats = countDiffStats(chunks);
    // "import B" aggiunta, "const x = 1;" rimossa, "const x = 2;" aggiunta
    expect(stats.added).toBeGreaterThanOrEqual(2);
    expect(stats.removed).toBeGreaterThanOrEqual(1);
    expect(stats.unchanged).toBeGreaterThanOrEqual(2);
  });

  it('dovrebbe gestire stringhe con newline finale', () => {
    const before = 'a\nb\n';
    const after = 'a\nb\n';
    const chunks = computeDiff(before, after);
    expect(chunks.every(c => c.type === 'equal')).toBe(true);
  });

  it('dovrebbe ricostruire il testo after dai chunk add/equal', () => {
    const before = 'riga1\nriga2\nriga3';
    const after = 'riga1\nrigaNuova\nriga3';
    const chunks = computeDiff(before, after);
    // Ricostruisce after dai chunk add + equal (in ordine di rightStart)
    const reconstructed = chunks
      .filter(c => c.type !== 'remove')
      .flatMap(c => c.lines)
      .join('\n');
    expect(reconstructed).toBe(after);
  });

  it('dovrebbe ricostruire il testo before dai chunk remove/equal', () => {
    const before = 'riga1\nriga2\nriga3';
    const after = 'riga1\nrigaNuova\nriga3';
    const chunks = computeDiff(before, after);
    const reconstructed = chunks
      .filter(c => c.type !== 'add')
      .flatMap(c => c.lines)
      .join('\n');
    expect(reconstructed).toBe(before);
  });
});

// ============================================================================
// countDiffStats — test
// ============================================================================

describe('countDiffStats', () => {
  it('dovrebbe contare correttamente aggiunte, rimozioni e invariate', () => {
    const chunks = computeDiff('a\nb\nc', 'a\nd\nc');
    const stats = countDiffStats(chunks);
    expect(stats.added).toBe(1);
    expect(stats.removed).toBe(1);
    expect(stats.unchanged).toBe(2); // 'a' e 'c'
  });

  it('dovrebbe restituire tutto unchanged per testi identici', () => {
    const text = 'x\ny\nz';
    const stats = countDiffStats(computeDiff(text, text));
    expect(stats.added).toBe(0);
    expect(stats.removed).toBe(0);
    expect(stats.unchanged).toBe(3);
  });

  it('dovrebbe restituire solo added per before vuoto', () => {
    const stats = countDiffStats(computeDiff('', 'a\nb'));
    expect(stats.added).toBe(2);
    expect(stats.removed).toBe(0);
    expect(stats.unchanged).toBe(0);
  });
});

// ============================================================================
// getChangeIndices — test
// ============================================================================

describe('getChangeIndices', () => {
  it('dovrebbe restituire array vuoto per diff senza modifiche', () => {
    const text = 'a\nb\nc';
    const indices = getChangeIndices(computeDiff(text, text));
    expect(indices).toEqual([]);
  });

  it('dovrebbe includere gli indici dei chunk non-equal', () => {
    const chunks = computeDiff('a\nb\nc', 'a\nd\nc');
    const indices = getChangeIndices(chunks);
    expect(indices.length).toBeGreaterThan(0);
    for (const idx of indices) {
      expect(chunks[idx].type).not.toBe('equal');
    }
  });
});
