import { badgeLabel } from "@substrate/contracts/attention";

import { createAttentionBadge } from "./attention-badge.ts";
import { expect, test } from "bun:test";

test("badge labels clear at zero and cap only the visible count", () => {
  expect(badgeLabel(0)).toBe("");
  expect(badgeLabel(6)).toBe("6");
  expect(badgeLabel(99)).toBe("99");
  expect(badgeLabel(100)).toBe("99+");
});

test("focus does not clear attention; zero clears it and restores exact accessible counts", () => {
  const changes: { label: string; description: string }[] = [];
  const badge = createAttentionBadge((label, description) => changes.push({ label, description }));
  badge.set(6);
  badge.set(6);
  badge.set(120);
  badge.clear();
  expect(changes).toEqual([
    { label: "6", description: "6 items need your attention" },
    { label: "99+", description: "120 items need your attention" },
    { label: "", description: "" },
  ]);
});
