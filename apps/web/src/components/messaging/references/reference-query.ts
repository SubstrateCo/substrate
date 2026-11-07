import type { ReferenceKind } from "./reference-picker";

export type ReferenceQuery = {
  start: number;
  end: number;
  kind: ReferenceKind | "all";
  query: string;
};

export function referenceQuery(draft: string, caret: number): ReferenceQuery | null {
  const match = /(?:^|\s)@([^\s@[\]]*)$/.exec(draft.slice(0, caret));
  if (!match) return null;
  const text = match[1]!;
  const prefix = /^(user|task|project):/i.exec(text);
  let kind: ReferenceQuery["kind"] = "all";
  if (prefix) {
    if (prefix[1]!.toLowerCase() === "user") kind = "person";
    if (prefix[1]!.toLowerCase() === "task") kind = "task";
    if (prefix[1]!.toLowerCase() === "project") kind = "project";
  }
  return {
    start: caret - text.length - 1,
    end: caret,
    kind,
    query: prefix ? text.slice(prefix[0].length) : text,
  };
}

export function referencePrefix(kind: ReferenceQuery["kind"]): string {
  return kind === "all" ? "@" : `@${kind === "person" ? "user" : kind}:`;
}
