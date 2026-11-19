import type { ReactNode } from "react";

import {
  EntityReference,
  type WorkspaceReference,
} from "@/components/messaging/references/entity-reference";
import { referenceKey } from "@/lib/messaging/reference-token";
import type { ExtraProps } from "react-markdown";

export function MarkdownReference({
  node,
  children,
  references,
  loading,
}: ExtraProps & {
  children?: ReactNode;
  references?: Map<string, WorkspaceReference>;
  loading: boolean;
}) {
  const id = node?.properties["data-reference-id"];
  const kind = node?.properties["data-reference-kind"];
  return id ? (
    <EntityReference
      reference={references?.get(referenceKey(String(kind), String(id)))}
      loading={loading}
    />
  ) : (
    <span>{children}</span>
  );
}
