import type { IndexStats, TableStats } from "./catalog";

export function indexVerdict(
  index: Pick<IndexStats, "primary" | "unique" | "constraint_name" | "idx_scan">,
  table: Pick<TableStats, "exact_rows" | "seq_scan" | "idx_scan" | "heap_size_bytes">,
  coverageScans: number | undefined,
  planUses = 0,
  blockSize = 8192,
) {
  if (index.primary || index.unique || index.constraint_name) return "keep (constraint)";
  if (index.idx_scan > 0) return "used";
  if (coverageScans && coverageScans > 0) return "coverage only";
  if (planUses > 0) return "plan-only";
  if (table.exact_rows === 0) return "not exercised (empty table)";
  if (table.exact_rows < 1_000 || table.heap_size_bytes < 8 * blockSize)
    return "not judged (small table)";
  if (coverageScans === undefined) return "not judged (coverage missing)";
  if (table.seq_scan + table.idx_scan === 0) return "not exercised (no reads)";
  return "review candidate";
}
