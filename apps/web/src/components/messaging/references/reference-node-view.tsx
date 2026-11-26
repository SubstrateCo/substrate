import { useContext, type MouseEvent } from "react";

import { EntityReference } from "@/components/messaging/references/entity-reference";
import { ReferencesContext } from "@/components/messaging/references/references-context";
import { referenceKey } from "@/lib/messaging/reference-token";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";

export function ReferenceNodeView({ node, editor, getPos }: NodeViewProps) {
  const references = useContext(ReferencesContext);
  const reference = references.get(referenceKey(node.attrs.kind, node.attrs.id));
  return (
    <NodeViewWrapper
      as="span"
      contentEditable={false}
      className="inline-block max-w-full align-baseline [&>span]:max-w-64"
      data-reference-chip
      onMouseDown={(event: MouseEvent<HTMLSpanElement>) => {
        event.preventDefault();
        const position = getPos();
        if (position === undefined) return;
        editor.commands.setTextSelection(position + node.nodeSize);
        editor.view.focus();
      }}
    >
      <EntityReference
        reference={
          reference ? { id: reference.id, kind: reference.kind, label: reference.label } : undefined
        }
      />
    </NodeViewWrapper>
  );
}
