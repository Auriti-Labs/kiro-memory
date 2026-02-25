export function mergeAndDeduplicateByProject<T extends { id: number; project: string }>(
  liveData: T[],
  paginatedData: T[]
): T[] {
  const seen = new Set<number>();
  const merged: T[] = [];

  // Add live data first
  for (const item of liveData) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      merged.push(item);
    }
  }

  // Add paginated data
  for (const item of paginatedData) {
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
