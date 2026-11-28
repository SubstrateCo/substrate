import {
  referenceQuery,
  type ReferenceKind,
  type ReferenceQuery,
} from "@substrate/contracts/messaging/references";

import { bodySegments, referenceKey, referenceToken } from "./reference-tokens";

/**
 * The composer's model. React Native's TextInput holds only plain text, so a reference shows as
 * its label ("@Ada") and this model keeps the token behind it. An edit that touches a label
 * removes the whole reference, so a token is never left half-written.
 */
export type DraftPart =
  | { type: "text"; text: string }
  | { type: "reference"; kind: ReferenceKind; id: string; label: string };

export type ReferenceLabels = Record<string, string>;

const unresolvedLabel = "Reference";

export function referenceDisplay(part: { kind: ReferenceKind; label: string }): string {
  return `${part.kind === "channel" || part.kind === "thread" ? "#" : "@"}${part.label}`;
}

export function partsFromBody(body: string, labels: ReferenceLabels = {}): DraftPart[] {
  return normalize(
    bodySegments(body).map((segment) =>
      segment.type === "text"
        ? segment
        : {
            ...segment,
            label: labels[referenceKey(segment.kind, segment.id)] ?? unresolvedLabel,
          },
    ),
  );
}

export function bodyFromParts(parts: readonly DraftPart[]): string {
  return parts
    .map((part) => (part.type === "text" ? part.text : referenceToken(part.kind, part.id)))
    .join("");
}

export function displayText(parts: readonly DraftPart[]): string {
  return parts.map((part) => (part.type === "text" ? part.text : referenceDisplay(part))).join("");
}

export function partLabels(parts: readonly DraftPart[]) {
  return Object.fromEntries(
    parts.flatMap((part) =>
      part.type === "reference" ? [[referenceKey(part.kind, part.id), part.label] as const] : [],
    ),
  );
}

export function draftIdentity(parts: readonly DraftPart[]) {
  return JSON.stringify([bodyFromParts(parts), partLabels(parts)]);
}

type Span = { part: DraftPart; start: number; end: number };

function spans(parts: readonly DraftPart[]): Span[] {
  let offset = 0;
  return parts.map((part) => {
    const length = part.type === "text" ? part.text.length : referenceDisplay(part).length;
    const span = { part, start: offset, end: offset + length };
    offset += length;
    return span;
  });
}

function normalize(parts: DraftPart[]): DraftPart[] {
  const result: DraftPart[] = [];
  for (const part of parts) {
    if (part.type === "text" && !part.text) continue;
    const last = result.at(-1);
    if (part.type === "text" && last?.type === "text") last.text += part.text;
    else result.push(part.type === "text" ? { ...part } : part);
  }
  return result;
}

function spliceDisplay(
  parts: readonly DraftPart[],
  start: number,
  end: number,
  insert: DraftPart[],
): DraftPart[] {
  const before: DraftPart[] = [];
  const after: DraftPart[] = [];
  for (const span of spans(parts)) {
    const { part } = span;
    if (part.type === "reference") {
      const touched =
        span.start < end && span.end > start && !(start === end && span.start === start);
      const inside = start === end && span.start < start && span.end > start;
      if (touched || inside) continue;
      (span.end <= start ? before : after).push(part);
      continue;
    }
    if (span.end <= start) before.push(part);
    else if (span.start >= end && !(start === end && span.start < start)) after.push(part);
    else {
      const head = part.text.slice(0, Math.max(0, start - span.start));
      const tail = part.text.slice(Math.max(0, end - span.start));
      if (head) before.push({ type: "text", text: head });
      if (tail) after.push({ type: "text", text: tail });
    }
  }
  return normalize([...before, ...insert, ...after]);
}

export function applyDisplayChange(parts: readonly DraftPart[], next: string): DraftPart[] {
  const previous = displayText(parts);
  if (previous === next) return [...parts];
  let prefix = 0;
  const shortest = Math.min(previous.length, next.length);
  while (prefix < shortest && previous[prefix] === next[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < shortest - prefix &&
    previous[previous.length - 1 - suffix] === next[next.length - 1 - suffix]
  )
    suffix++;
  const inserted = next.slice(prefix, next.length - suffix);
  return spliceDisplay(
    parts,
    prefix,
    previous.length - suffix,
    inserted ? [{ type: "text", text: inserted }] : [],
  );
}

export function activeReferenceQuery(
  parts: readonly DraftPart[],
  caret: number,
): ReferenceQuery | null {
  const query = referenceQuery(displayText(parts), caret);
  if (!query) return null;
  const inReference = spans(parts).some(
    (span) => span.part.type === "reference" && span.start <= query.start && span.end > query.start,
  );
  return inReference ? null : query;
}

export function insertReference(
  parts: readonly DraftPart[],
  query: Pick<ReferenceQuery, "start" | "end">,
  reference: { kind: ReferenceKind; id: string; label: string },
) {
  const part: DraftPart = { type: "reference", ...reference };
  const next = spliceDisplay(parts, query.start, query.end, [part, { type: "text", text: " " }]);
  return { parts: next, caret: query.start + referenceDisplay(part).length + 1 };
}
