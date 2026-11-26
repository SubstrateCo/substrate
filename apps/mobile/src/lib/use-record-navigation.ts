import { useState } from "react";

import { firstParam, parseRecordTarget, type RecordTarget } from "./navigation";
import { router, useLocalSearchParams } from "expo-router";

export function useRecordNavigation() {
  const params = useLocalSearchParams<{ record?: string }>();
  const [history, setHistory] = useState<RecordTarget[]>([]);
  const target = parseRecordTarget(firstParam(params.record));

  return {
    target,
    openRecord(record: RecordTarget) {
      if (target?.kind === record.kind && target.id === record.id) return;
      if (target) setHistory((items) => [...items, target]);
      router.setParams({ record: JSON.stringify(record) });
    },
    closeRecord() {
      const previous = history.at(-1);
      setHistory((items) => items.slice(0, -1));
      router.setParams({ record: previous ? JSON.stringify(previous) : undefined });
    },
    clearRecords() {
      setHistory([]);
      router.setParams({ record: undefined });
    },
  };
}
