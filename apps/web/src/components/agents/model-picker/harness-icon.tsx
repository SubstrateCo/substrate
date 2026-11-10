import type { HarnessKind } from "@startup-os/contracts/harness";

import antigravity from "./icons/antigravity.svg";
import claude from "./icons/claude.svg";
import codex from "./icons/codex.svg";

const icons = { claude, codex, antigravity };

export function HarnessIcon({
  harness,
  compact = false,
}: {
  harness: HarnessKind;
  compact?: boolean;
}) {
  const size = compact ? "size-3" : "size-5";
  if (harness === "opencode")
    return (
      <span
        aria-hidden="true"
        className={`${size} grid shrink-0 place-items-center rounded border bg-muted text-xs leading-none font-medium text-foreground`}
      >
        O
      </span>
    );
  return (
    <img
      src={icons[harness]}
      alt=""
      className={`${size} shrink-0 object-contain ${harness === "codex" ? "dark:invert" : ""}`}
    />
  );
}
