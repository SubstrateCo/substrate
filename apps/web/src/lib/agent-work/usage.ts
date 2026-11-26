import type { Usage } from "@substrate/contracts/harness-runtime";

const compact = (value: number) =>
  value >= 1000 ? `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k` : String(value);

/**
 * Token use as the harness reported it. Harnesses that report nothing show "Unavailable"; the
 * app never guesses a count or a cost.
 */
export function usageLabel(usage: Usage | null) {
  if (!usage) return "Unavailable";
  const parts: string[] = [];
  if (usage.inputTokens !== undefined) parts.push(`${compact(usage.inputTokens)} in`);
  if (usage.cachedInputTokens) parts.push(`${compact(usage.cachedInputTokens)} cached`);
  if (usage.outputTokens !== undefined) parts.push(`${compact(usage.outputTokens)} out`);
  if (usage.contextUsed !== undefined && usage.contextWindow)
    parts.push(`${Math.round((usage.contextUsed / usage.contextWindow) * 100)}% of context`);
  return parts.length ? parts.join(" · ") : "Unavailable";
}
