export const harnessKinds = ["opencode", "antigravity", "claude", "codex"] as const;
export type HarnessKind = (typeof harnessKinds)[number];
