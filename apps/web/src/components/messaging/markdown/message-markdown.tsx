import { createContext, useContext, type ReactNode } from "react";

import type { WorkspaceReference } from "../references/entity-reference";
import { MarkdownBody } from "./markdown-body";
import { remarkWorkspaceReferences } from "./remark-workspace-references";
import { MarkdownReference } from "@/components/messaging/markdown/markdown-reference";
import { referenceKey } from "@/lib/messaging/reference-token";
import type { ExtraProps, Options } from "react-markdown";

const MessageReferences = createContext<{
  references?: Map<string, WorkspaceReference>;
  loading: boolean;
}>({ loading: false });

function ReferenceSpan({ node, children }: ExtraProps & { children?: ReactNode }) {
  const { references, loading } = useContext(MessageReferences);
  return (
    <MarkdownReference node={node} references={references} loading={loading}>
      {children}
    </MarkdownReference>
  );
}

const components = { span: ReferenceSpan } satisfies Options["components"];

export function MessageMarkdown({
  body,
  references,
  referencesLoading = false,
}: {
  body: string;
  references?: WorkspaceReference[];
  referencesLoading?: boolean;
}) {
  const referencesByKey =
    references &&
    new Map(references.map((item) => [referenceKey(item.kind, item.id), item] as const));
  return (
    <MessageReferences value={{ references: referencesByKey, loading: referencesLoading }}>
      <MarkdownBody
        body={body}
        remarkPlugins={references ? [remarkWorkspaceReferences] : []}
        components={components}
      />
    </MessageReferences>
  );
}
