import type { HarnessKind } from "@startup-os/contracts/harness";

import antigravity from "./icons/antigravity.svg";
import claude from "./icons/claude.svg";
import codex from "./icons/codex.svg";

const icons = { claude, codex, antigravity };

/** A runtime's mark. The regular size sits in the same 24px tile everywhere; compact is bare. */
export function HarnessIcon({
  harness,
  compact = false,
}: {
  harness: HarnessKind;
  compact?: boolean;
}) {
  const size = compact ? "size-3" : "size-4";
  const mark =
    harness === "opencode" ? (
      <span
        aria-hidden="true"
        className={`${size} grid shrink-0 place-items-center text-xs leading-none font-semibold text-foreground`}
      >
        O
      </span>
    ) : (
      <img
        src={icons[harness]}
        alt=""
        className={`${size} shrink-0 object-contain ${harness === "codex" ? "dark:invert" : ""}`}
      />
    );
  if (compact) return mark;
  return (
    <span
      aria-hidden="true"
      className="grid size-6 shrink-0 place-items-center rounded-md border bg-muted/50"
    >
      {mark}
    </span>
  );
}
