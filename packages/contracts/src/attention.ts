import { z } from "zod";

export const attentionSummary = z.strictObject({
  count: z.number().int().nonnegative(),
});

export type AttentionSummary = z.infer<typeof attentionSummary>;

export function badgeLabel(count: number) {
  if (count <= 0) return "";
  return count > 99 ? "99+" : String(count);
}
