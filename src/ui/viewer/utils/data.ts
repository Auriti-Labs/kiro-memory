export function mergeAndDeduplicateByProject<T extends { id: number; project: string }>(
  liveData: T[],
  paginatedData: T[]
): T[] {
  const seen = new Set<number>();
  const merged: T[] = [];

  // Difesa: se i dati non sono array (es. errore API), ritorna lista vuota
  const live = Array.isArray(liveData) ? liveData : [];
  const paginated = Array.isArray(paginatedData) ? paginatedData : [];

  // Add live data first
  for (const item of live) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      merged.push(item);
    }
  }

  // Add paginated data
  for (const item of paginated) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      merged.push(item);
    }
  }

  // Sort by created_at_epoch descending
  return merged.sort((a, b) => {
    const aTime = (a as any).created_at_epoch || 0;
    const bTime = (b as any).created_at_epoch || 0;
    return bTime - aTime;
  });
}
