import { getTextBetween, type JSONContent } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";

export function referenceToken(node: Node): string {
  return `@[${node.attrs.kind}:${node.attrs.id}]`;
}

export function referenceDocument(value: string): JSONContent {
  return {
    type: "doc",
    content: value.split("\n").map((line) => {
      const content: JSONContent[] = [];
      let offset = 0;
      for (const match of line.matchAll(
        /@\[(task|project|person|channel|thread):([0-9a-f-]{36})\]/gi,
      )) {
        if (match.index > offset)
          content.push({ type: "text", text: line.slice(offset, match.index) });
        const kind = match[1]!.toLowerCase();
        const id = match[2]!.toLowerCase();
        content.push({
          type: "workspaceReference",
          attrs: { kind, id },
        });
        offset = match.index + match[0].length;
      }
      if (offset < line.length) content.push({ type: "text", text: line.slice(offset) });
      return { type: "paragraph", content };
    }),
  };
}

export function referenceDraftText(doc: Node, to = doc.content.size): string {
  return getTextBetween(
    doc,
    { from: 0, to },
    {
      blockSeparator: "\n",
      textSerializers: {
        workspaceReference: ({ node }) => referenceToken(node),
        hardBreak: () => "\n",
      },
    },
  );
}

export function referenceEditorPosition(doc: Node, offset: number): number {
  let remaining = Math.max(0, offset);
  let position = Math.max(1, doc.content.size - 1);
  let found = false;
  doc.descendants((node, pos) => {
    if (found) return false;
    if (node.isTextblock) {
      if (pos > 0) remaining--;
      if (remaining <= 0) {
        position = pos + 1;
        found = true;
      }
      return !found;
    }
    if (!node.isText && !node.isLeaf) return true;
    let length = node.text?.length ?? 0;
    if (node.type.name === "workspaceReference") length = referenceToken(node).length;
    if (node.type.name === "hardBreak") length = 1;
    if (remaining <= length) {
      position = pos + (node.isText ? remaining : Number(remaining > 0));
      found = true;
    }
    remaining -= length;
    return false;
  });
  return position;
}
