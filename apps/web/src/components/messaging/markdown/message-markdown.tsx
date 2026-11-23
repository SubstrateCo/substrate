import type { WorkspaceReference } from "../references/entity-reference";
import { remarkWorkspaceReferences } from "./remark-workspace-references";
import { MarkdownReference } from "@/components/messaging/markdown/markdown-reference";
import { referenceKey } from "@/lib/messaging/reference-token";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./message-markdown.css";

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
    <div className="message-markdown mt-0.5 text-sm/relaxed">
      <ReactMarkdown
        remarkPlugins={references ? [remarkGfm, remarkWorkspaceReferences] : [remarkGfm]}
        skipHtml
        components={{
          span: ({ node, children }) => (
            <MarkdownReference node={node} references={referencesByKey} loading={referencesLoading}>
              {children}
            </MarkdownReference>
          ),
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          img: ({ alt }) => (
            <span className="text-muted-foreground">[Image: {alt || "attachment"}]</span>
          ),
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
