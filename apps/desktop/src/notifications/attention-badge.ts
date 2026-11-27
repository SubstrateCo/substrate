import { badgeLabel } from "@substrate/contracts/attention";

export function createAttentionBadge(apply: (label: string, description: string) => void) {
  let previous: number | undefined;
  const set = (count: number) => {
    if (previous === count) return;
    previous = count;
    apply(
      badgeLabel(count),
      count ? `${count} ${count === 1 ? "item needs" : "items need"} your attention` : "",
    );
  };
  return { set, clear: () => set(0) };
}
