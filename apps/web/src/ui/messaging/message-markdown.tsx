import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { EntityReference, type WorkspaceReference } from "./entity-reference";
import { remarkWorkspaceReferences } from "./remark-workspace-references";
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
          span: ({ node, children }) => {
            const id = node?.properties["data-reference-id"];
            const kind = node?.properties["data-reference-kind"];
            return id ? (
              <EntityReference
                reference={references?.find((item) => item.id === id && item.kind === kind)}
                loading={referencesLoading}
              />
            ) : (
              <span>{children}</span>
            );
          },
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
