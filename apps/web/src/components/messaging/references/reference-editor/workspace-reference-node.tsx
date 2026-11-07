import { createContext, useContext } from "react";

import {
  EntityReference,
  type WorkspaceReference,
} from "@/components/messaging/references/entity-reference";
import { referenceToken } from "@/components/messaging/references/reference-editor-document";
import { Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";

export const ReferencesContext = createContext<WorkspaceReference[]>([]);

function ReferenceNodeView({ node }: NodeViewProps) {
  const references = useContext(ReferencesContext);
  const reference = references.find(
    (item) => item.id === node.attrs.id && item.kind === node.attrs.kind,
  );
  return (
    <NodeViewWrapper
      as="span"
      contentEditable={false}
      className="inline-block max-w-full align-baseline"
      data-reference-chip
    >
      <EntityReference
        reference={
          reference ? { id: reference.id, kind: reference.kind, label: reference.label } : undefined
        }
      />
    </NodeViewWrapper>
  );
}

export const WorkspaceReferenceNode = Node.create({
  name: "workspaceReference",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes: () => ({ kind: { default: "person" }, id: { default: "" } }),
  renderHTML: () => ["span", {}, "Workspace reference"],
  renderText: ({ node }) => referenceToken(node),
  addNodeView: () => ReactNodeViewRenderer(ReferenceNodeView),
});
