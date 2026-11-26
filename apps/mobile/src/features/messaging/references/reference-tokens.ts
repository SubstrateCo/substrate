/** Kinds a message token can name. The server resolves each one with the reader's access. */
export const referenceKinds = ["task", "project", "person", "agent", "channel", "thread"] as const;
export type ReferenceKind = (typeof referenceKinds)[number];

const referenceTokenPattern =
  /@\[(task|project|person|agent|channel|thread):([0-9a-f-]{36})\]/gi;

export function referenceToken(kind: ReferenceKind, id: string): string {
  return `@[${kind}:${id}]`;
}

export function referenceKey(kind: string, id: string): string {
  return `${kind}:${id}`;
}

export type BodySegment =
  | { type: "text"; text: string }
  | { type: "reference"; kind: ReferenceKind; id: string };

/** Splits a stored body into text and reference tokens, in order. */
export function bodySegments(body: string): BodySegment[] {
  const segments: BodySegment[] = [];
  let offset = 0;
  for (const match of body.matchAll(referenceTokenPattern)) {
    if (match.index > offset)
      segments.push({ type: "text", text: body.slice(offset, match.index) });
    segments.push({
      type: "reference",
      // SAFETY: the pattern matches only the listed kinds.
      kind: match[1]!.toLowerCase() as ReferenceKind,
      id: match[2]!.toLowerCase(),
    });
    offset = match.index + match[0].length;
  }
  if (offset < body.length) segments.push({ type: "text", text: body.slice(offset) });
  return segments;
}
