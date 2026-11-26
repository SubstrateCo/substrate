import type { ReferenceKind } from "./reference-tokens";

/** A picker tab: one kind, or "all" for a mixed list. */
export type ReferenceTab = ReferenceKind | "all";

export type ReferenceQuery = {
  start: number;
  end: number;
  trigger: "@" | "#";
  kind: ReferenceTab;
  query: string;
};

/** The `@` or `#` query that ends at the caret, as the web composer parses it. */
export function referenceQuery(draft: string, caret: number): ReferenceQuery | null {
  if (caret < 0) return null;
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
  const prefix = (
    trigger === "#" ? /^(channel|thread)s?:/i : /^(user|agent|task|project)s?:/i
  ).exec(text);
  let kind: ReferenceTab = trigger === "#" ? "channel" : "all";
  if (prefix) {
    // SAFETY: the patterns allow only these names. Only "user" differs from its kind.
    const name = prefix[1]!.toLowerCase() as Exclude<ReferenceKind, "person"> | "user";
    kind = name === "user" ? "person" : name;
  }
  return {
    start: caret - text.length - 1,
    end: caret,
    trigger,
    kind,
    query: prefix ? text.slice(prefix[0].length) : text,
  };
}
