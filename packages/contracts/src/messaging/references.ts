/** Kinds a message reference can name. The server resolves each one with the reader's access. */
export const referenceKinds = ["task", "project", "person", "agent", "channel", "thread"] as const;
export type ReferenceKind = (typeof referenceKinds)[number];

/** A picker tab: one kind, or "all" for a mixed list. */
export type ReferenceTab = ReferenceKind | "all";

export type ReferenceQuery = {
  start: number;
  end: number;
  trigger: "@" | "#";
  kind: ReferenceTab;
  query: string;
};

const triggerThenUpToFourWords = /(?:^|\s)([@#])((?:[^\s@#[\]]+(?: [^\s@#[\]]+){0,3} ?)?)$/;

function endsInsideMarkdownCode(text: string) {
  return (
    (text.match(/```|~~~/g)?.length ?? 0) % 2 === 1 ||
    (text.split("\n").at(-1)!.match(/`/g)?.length ?? 0) % 2 === 1
  );
}

/** The `@` or `#` query that ends at the caret, or null when the caret is not in one. */
export function referenceQuery(draft: string, caret: number): ReferenceQuery | null {
  if (caret < 0) return null;
  const before = draft.slice(0, caret);
  if (endsInsideMarkdownCode(before)) return null;
  const match = triggerThenUpToFourWords.exec(before);
  if (!match) return null;
  const trigger = match[1] === "#" ? "#" : "@";
  const text = match[2]!;
  if (trigger === "#" && text.includes(" ")) return null;
  const prefix = (
    trigger === "#" ? /^(channel|thread)s?:/i : /^(user|agent|task|project)s?:/i
  ).exec(text);
  let kind: ReferenceTab = trigger === "#" ? "channel" : "all";
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

type WorkLink = { entityId: string; purpose: string; canRemove: boolean };

/**
 * The work to list under a message. Mentions already show as chips in the body, so they are not
 * repeated. A record linked for several reasons shows once: it says "Created here" when the
 * message created it, and it can be unlinked when any of its links can.
 */
export function attachedWork<T extends WorkLink>(links: readonly T[]) {
  const byEntity = new Map<string, T>();
  for (const link of links) {
    if (link.purpose === "mention") continue;
    const seen = byEntity.get(link.entityId);
    byEntity.set(
      link.entityId,
      seen
        ? {
            ...seen,
            purpose: seen.purpose === "source" ? seen.purpose : link.purpose,
            canRemove: seen.canRemove || link.canRemove,
          }
        : link,
    );
  }
  return [...byEntity.values()];
}
