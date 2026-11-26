import { referenceKinds } from "@/features/messaging/references/reference-tokens";
import { referenceDisplay, type DraftPart } from "@/features/messaging/references/token-draft";
import { z } from "zod";

const mentionSchema = z.object({
  type: z.literal("mention"),
  attrs: z.object({
    kind: z.enum(referenceKinds),
    id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
    label: z.string(),
    referenceLabel: z.string().nullish(),
    mentionSuggestionChar: z.string().nullish(),
  }),
});
const inlineSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({ type: z.literal("hardBreak") }),
  mentionSchema,
]);
const paragraphSchema = z.object({
  type: z.literal("paragraph"),
  content: z.array(inlineSchema).default([]),
});
export const editorDocumentSchema = z.object({
  type: z.literal("doc"),
  content: z.array(paragraphSchema).default([]),
});
type EditorParagraph = z.infer<typeof paragraphSchema>;
export type EditorDocument = z.infer<typeof editorDocumentSchema>;

/** The editor owns nodes. Only this boundary converts them to the message draft. */
export function editorDocument(parts: readonly DraftPart[]): EditorDocument {
  const paragraphs: EditorParagraph[] = [{ type: "paragraph", content: [] }];
  for (const part of parts) {
    if (part.type === "reference") {
      paragraphs.at(-1)!.content.push({
        type: "mention",
        attrs: {
          kind: part.kind,
          id: part.id,
          label: referenceDisplay(part),
          referenceLabel: part.label,
          mentionSuggestionChar: referenceDisplay(part)[0],
        },
      });
      continue;
    }
    const lines = part.text.split("\n");
    for (const [index, text] of lines.entries()) {
      if (index) paragraphs.push({ type: "paragraph", content: [] });
      if (text) paragraphs.at(-1)!.content.push({ type: "text", text });
    }
  }
  return { type: "doc", content: paragraphs };
}

/** Serialize the editor document after the adapter parses its JSON at the input boundary. */
export function partsFromEditor(document: EditorDocument): DraftPart[] {
  const parts: DraftPart[] = [];
  const text = (value: string) => {
    const last = parts.at(-1);
    if (last?.type === "text") last.text += value;
    else if (value) parts.push({ type: "text", text: value });
  };
  for (const [index, paragraph] of document.content.entries()) {
    if (index) text("\n");
    for (const node of paragraph.content) {
      if (node.type === "text") text(node.text);
      else if (node.type === "hardBreak") text("\n");
      else {
        const { kind, id, label, referenceLabel } = node.attrs;
        parts.push({
          type: "reference",
          kind,
          id,
          label: referenceLabel ?? label.replace(/^[@#]/, ""),
        });
      }
    }
  }
  return parts;
}

/** Native scalar offsets count an inline atom once, not as its displayed label. */
export function displayToScalar(parts: readonly DraftPart[], caret: number): number {
  let display = 0;
  let scalar = 0;
  for (const part of parts) {
    const label = part.type === "text" ? part.text : referenceDisplay(part);
    if (caret <= display + label.length) {
      if (part.type === "reference") return scalar + (caret > display ? 1 : 0);
      return scalar + Array.from(label.slice(0, Math.max(0, caret - display))).length;
    }
    display += label.length;
    scalar += part.type === "text" ? Array.from(label).length : 1;
  }
  return scalar;
}

export function scalarToDisplay(parts: readonly DraftPart[], offset: number): number {
  let display = 0;
  let scalar = 0;
  for (const part of parts) {
    const label = part.type === "text" ? part.text : referenceDisplay(part);
    const length = part.type === "text" ? Array.from(label).length : 1;
    if (offset <= scalar + length) {
      if (part.type === "reference") return display + (offset > scalar ? label.length : 0);
      return (
        display +
        Array.from(label)
          .slice(0, Math.max(0, offset - scalar))
          .join("").length
      );
    }
    display += label.length;
    scalar += length;
  }
  return display;
}

/** Web ProseMirror positions include paragraph boundaries and use UTF-16 text offsets. */
export function displayToDocument(parts: readonly DraftPart[], caret: number): number {
  let display = 0;
  let position = 1;
  for (const part of parts) {
    const label = part.type === "text" ? part.text : referenceDisplay(part);
    const take = Math.max(0, Math.min(label.length, caret - display));
    if (part.type === "reference") position += take > 0 ? 1 : 0;
    else {
      const prefix = label.slice(0, take);
      position += prefix.length + (prefix.match(/\n/g)?.length ?? 0);
    }
    if (caret <= display + label.length) return position;
    display += label.length;
  }
  return position;
}

export function documentToDisplay(parts: readonly DraftPart[], position: number): number {
  let display = 0;
  let cursor = 1;
  for (const part of parts) {
    const label = part.type === "text" ? part.text : referenceDisplay(part);
    if (part.type === "reference") {
      if (position <= cursor) return display;
      cursor++;
      display += label.length;
    } else {
      for (const character of label) {
        if (position <= cursor) return display;
        cursor += character === "\n" ? 2 : character.length;
        display += character.length;
      }
    }
  }
  return display;
}
