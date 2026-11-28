import type { SkillSearch } from "@substrate/contracts/agents/skill-catalog";

import { api } from "../client";
import { readResult } from "../result";

export class SkillSearchPaused extends Error {
  constructor(readonly retryAt: number) {
    super("Search is paused to respect rate limits. Try again shortly.");
    this.name = "SkillSearchPaused";
  }
}

let availableAt = 0;
export async function searchSkills(query: string, signal?: AbortSignal): Promise<SkillSearch> {
  if (Date.now() < availableAt) throw new SkillSearchPaused(availableAt);
  const response = await api.agents.skills.search.$post({ json: { query } }, { init: { signal } });
  const remaining =
    response.headers.get("x-ratelimit-remaining") ?? response.headers.get("ratelimit-remaining");
  if (response.status === 429 || remaining === "0") {
    const retry = response.headers.get("retry-after");
    const seconds = retry === null ? 60 : Number(retry);
    availableAt = Number.isFinite(seconds)
      ? Date.now() + Math.max(1, seconds) * 1000
      : Math.max(Date.now() + 1000, Date.parse(retry!) || Date.now() + 60_000);
    if (response.status === 429) throw new SkillSearchPaused(availableAt);
  }
  return readResult(Promise.resolve(response));
}
