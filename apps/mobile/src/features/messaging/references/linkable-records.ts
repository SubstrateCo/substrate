import type { ContextEntityType } from "@substrate/contracts/context/input";

export type LinkableRecord = {
  id: string;
  kind: ContextEntityType;
  title: string;
  detail?: string;
};

export const linkableKindLabels: Record<ContextEntityType, string> = {
  task: "Tasks",
  project: "Projects",
  contact: "Contacts",
  account: "Accounts",
  deal: "Deals",
  contact_interaction: "Interactions",
};

/**
 * Splits one link request per record into what was linked and what failed, so earlier links stay
 * and the person can retry only the failures.
 */
export function settleLinks<T>(
  items: readonly T[],
  settled: readonly PromiseSettledResult<unknown>[],
) {
  const linked: T[] = [];
  const failed: { item: T; error: Error }[] = [];
  items.forEach((item, index) => {
    const result = settled[index];
    if (result.status === "fulfilled") linked.push(item);
    else {
      const reason: unknown = result.reason;
      failed.push({ item, error: reason instanceof Error ? reason : new Error(String(reason)) });
    }
  });
  return { linked, failed };
}
