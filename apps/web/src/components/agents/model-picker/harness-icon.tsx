import type { HarnessKind } from "@startup-os/contracts/harness";

import antigravity from "./icons/antigravity.svg";
import claude from "./icons/claude.svg";
import codex from "./icons/codex.svg";
import opencodeDark from "./icons/opencode-dark.svg";
import opencodeLight from "./icons/opencode-light.svg";

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
      <>
        <img src={opencodeLight} alt="" className={`${size} shrink-0 object-contain dark:hidden`} />
        <img
          src={opencodeDark}
          alt=""
          className={`${size} hidden shrink-0 object-contain dark:block`}
        />
      </>
    );
  return (
    <img
      src={icons[harness]}
      alt=""
      className={`${size} shrink-0 object-contain ${harness === "codex" ? "dark:invert" : ""}`}
    />
  );
}
