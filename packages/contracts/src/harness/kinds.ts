/** Project instructions file each harness loads from its agent folder. */
export const harnessInstructionsFiles = {
  opencode: "AGENTS.md",
  antigravity: "AGENTS.md",
  claude: "CLAUDE.md",
  codex: "AGENTS.md",
} as const;

export type HarnessKind = keyof typeof harnessInstructionsFiles;
// SAFETY: these keys come directly from the nonempty harness metadata above.
export const harnessKinds = Object.keys(harnessInstructionsFiles) as [
  HarnessKind,
  ...HarnessKind[],
];
