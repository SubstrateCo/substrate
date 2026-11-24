import type { WorkspaceReference } from "../references/entity-reference";
import { MarkdownBody } from "./markdown-body";
import { remarkWorkspaceReferences } from "./remark-workspace-references";
import { MarkdownReference } from "@/components/messaging/markdown/markdown-reference";
import { referenceKey } from "@/lib/messaging/reference-token";

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
    <MarkdownBody
      body={body}
      remarkPlugins={references ? [remarkWorkspaceReferences] : []}
      components={{
        span: ({ node, children }) => (
          <MarkdownReference node={node} references={referencesByKey} loading={referencesLoading}>
            {children}
          </MarkdownReference>
        ),
      }}
    />
  );
}
