import type { IndexStats } from "./catalog";

export interface Redundancy {
  table: string;
  index: string;
  covering: string;
  reason: string;
}

export function findRedundancy(indexes: IndexStats[]): Redundancy[] {
  const result: Redundancy[] = [];
  for (let i = 0; i < indexes.length; i++) {
    const left = indexes[i]!;
    for (let j = i + 1; j < indexes.length; j++) {
      const right = indexes[j]!;
      if (right.table !== left.table || right.method !== left.method) continue;
      const sameKeys =
        left.key_attributes.length === right.key_attributes.length &&
        left.key_attributes.every((key, position) => key === right.key_attributes[position]);
      if (sameKeys && Boolean(left.predicate) !== Boolean(right.predicate)) {
        result.push({
          table: left.table,
          index: left.name,
          covering: right.name,
          reason: "same keys; partial vs non-partial",
        });
        continue;
      }
      if (left.method !== "btree") continue;
      const [shorter, longer] =
        left.key_attributes.length <= right.key_attributes.length ? [left, right] : [right, left];
      const prefix = shorter.key_attributes.every(
        (key, position) => key === longer.key_attributes[position],
      );
      // A non-partial covering index can serve either predicate. Do not infer implication
      // between different predicates from their text.
      const compatible = !longer.predicate || shorter.predicate === longer.predicate;
      if (prefix && compatible) {
        result.push({
          table: left.table,
          index: shorter.name,
          covering: longer.name,
          reason: "btree left-prefix; matching opclass/collation/order",
        });
      }
    }
  }
  return result;
}
