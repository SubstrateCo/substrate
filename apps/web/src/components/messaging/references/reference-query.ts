import type { ReferenceKind } from "./reference-picker";

export type ReferenceQuery = {
  start: number;
  end: number;
  trigger: "@" | "#";
  kind: ReferenceKind | "all";
  query: string;
};

export function referenceQuery(draft: string, caret: number): ReferenceQuery | null {
  const before = draft.slice(0, caret);
  // Markdown code is literal, not a place to insert references.
  if (
    (before.match(/```|~~~/g)?.length ?? 0) % 2 ||
    (before.split("\n").at(-1)!.match(/`/g)?.length ?? 0) % 2
  )
    return null;
  const match = /(?:^|\s)([@#])([^\s@#[\]]*)$/.exec(before);
  if (!match) return null;
  const trigger = match[1] === "#" ? "#" : "@";
  const text = match[2]!;
  const prefix = (trigger === "#" ? /^(channel|thread)s?:/i : /^(user|task|project)s?:/i).exec(
    text,
  );
  let kind: ReferenceQuery["kind"] = trigger === "#" ? "channel" : "all";
  if (prefix) {
    if (prefix[1]!.toLowerCase() === "user") kind = "person";
    if (prefix[1]!.toLowerCase() === "task") kind = "task";
    if (prefix[1]!.toLowerCase() === "project") kind = "project";
    if (prefix[1]!.toLowerCase() === "channel") kind = "channel";
    if (prefix[1]!.toLowerCase() === "thread") kind = "thread";
  }
  return {
    start: caret - text.length - 1,
    end: caret,
    trigger,
    kind,
    query: prefix ? text.slice(prefix[0].length) : text,
  };
}
