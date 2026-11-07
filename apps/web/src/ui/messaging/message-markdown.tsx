import type { WorkspaceReference } from "./entity-reference";
import { remarkWorkspaceReferences } from "./remark-workspace-references";
import { MarkdownReference } from "@/ui/messaging/message-markdown/markdown-reference";
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
  return (
    <div className="message-markdown mt-0.5 text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={references ? [remarkGfm, remarkWorkspaceReferences] : [remarkGfm]}
        skipHtml
        components={{
          span: ({ node, children }) => (
            <MarkdownReference node={node} references={references} loading={referencesLoading}>
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
