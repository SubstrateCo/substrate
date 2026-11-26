import type { ReferenceKind } from "./reference-picker-view";

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
  // Up to four words joined by single spaces, such as a full name or a task title. A space at the
  // start, two spaces in a row, or a line break ends the query. Words need a space between them,
  // so the pattern cannot backtrack through ways of splitting one long word.
  const match = /(?:^|\s)([@#])((?:[^\s@#[\]]+(?: [^\s@#[\]]+){0,3} ?)?)$/.exec(before);
  if (!match) return null;
  const trigger = match[1] === "#" ? "#" : "@";
  const text = match[2]!;
  // Channel names have no spaces, so a space ends a "#" query.
  if (trigger === "#" && text.includes(" ")) return null;
  const prefix = (
    trigger === "#" ? /^(channel|thread)s?:/i : /^(user|agent|task|project)s?:/i
  ).exec(text);
  let kind: ReferenceQuery["kind"] = trigger === "#" ? "channel" : "all";
  if (prefix) {
    // SAFETY: The patterns allow only these names. Only "user" differs from its kind.
    const name = prefix[1]!.toLowerCase() as Exclude<ReferenceKind, "person"> | "user";
    kind = name === "user" ? "person" : name;
  }
  return {
    start: caret - text.length - 1,
    end: caret,
    trigger,
    kind,
    query: (prefix ? text.slice(prefix[0].length) : text).trim(),
  };
}
