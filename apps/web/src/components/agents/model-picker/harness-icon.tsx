import type { HarnessKind } from "@substrate/contracts/harness";

import claude from "./icons/claude.svg";
import codex from "./icons/codex.svg";
import opencodeDark from "./icons/opencode-dark.svg";
import opencodeLight from "./icons/opencode-light.svg";
import { Image } from "@/components/ui/image";

const icons = { claude, codex };

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
        <Image src={opencodeLight} darkSrc={opencodeDark} className="size-full object-contain" />
      </span>
    ) : (
      <Image
        src={icons[harness]}
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
