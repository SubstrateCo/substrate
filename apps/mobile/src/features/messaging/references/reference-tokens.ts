import type { ReferenceKind } from "@substrate/contracts/messaging/references";

const referenceTokenPattern = /@\[(task|project|person|agent|channel|thread):([0-9a-f-]{36})\]/gi;

export function referenceToken(kind: ReferenceKind, id: string): string {
  return `@[${kind}:${id}]`;
}

export function referenceKey(kind: string, id: string): string {
  return `${kind}:${id}`;
}

export type BodySegment =
  | { type: "text"; text: string }
  | { type: "reference"; kind: ReferenceKind; id: string };

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
