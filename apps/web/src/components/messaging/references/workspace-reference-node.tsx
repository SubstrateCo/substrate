import { referenceToken } from "@/components/messaging/references/reference-editor-document";
import { ReferenceNodeView } from "@/components/messaging/references/reference-node-view";
import { Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

export const WorkspaceReferenceNode = Node.create({
  name: "workspaceReference",
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,
  addAttributes: () => ({ kind: { default: "person" }, id: { default: "" } }),
  renderHTML: () => ["span", {}, "Workspace reference"],
  renderText: ({ node }) => referenceToken(node),
  addNodeView: () => ReactNodeViewRenderer(ReferenceNodeView),
});
