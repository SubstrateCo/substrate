import type { HarnessKind } from "@substrate/contracts/harness";

import antigravity from "./icons/antigravity.svg";
import claude from "./icons/claude.svg";
import codex from "./icons/codex.svg";
import opencodeDark from "./icons/opencode-dark.svg";
import opencodeLight from "./icons/opencode-light.svg";

const icons = { claude, codex, antigravity };

/** A runtime's mark, with a smaller size for model metadata. */
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
      <span aria-hidden="true" className={`${size} shrink-0`}>
        <img src={opencodeLight} alt="" className="size-full object-contain dark:hidden" />
        <img src={opencodeDark} alt="" className="hidden size-full object-contain dark:block" />
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
    <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center">
      {mark}
    </span>
  );
}
