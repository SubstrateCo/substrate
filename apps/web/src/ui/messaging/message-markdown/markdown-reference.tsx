import type { ReactNode } from "react";

import { EntityReference, type WorkspaceReference } from "@/ui/messaging/entity-reference";
import type { ExtraProps } from "react-markdown";

export function MarkdownReference({
  node,
  children,
  references,
  loading,
}: ExtraProps & {
  children?: ReactNode;
  references?: WorkspaceReference[];
  loading: boolean;
}) {
  const id = node?.properties["data-reference-id"];
  const kind = node?.properties["data-reference-kind"];
  return id ? (
    <EntityReference
      reference={references?.find((item) => item.id === id && item.kind === kind)}
      loading={loading}
    />
  ) : (
    <span>{children}</span>
  );
}
