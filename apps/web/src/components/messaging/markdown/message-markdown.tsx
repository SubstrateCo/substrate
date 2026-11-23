import type { WorkspaceReference } from "../references/entity-reference";
import { remarkWorkspaceReferences } from "./remark-workspace-references";
import { MarkdownReference } from "@/components/messaging/markdown/markdown-reference";
import { CodeBlock, CodeBlockContent } from "@/components/ui/code-block";
import { TextLink } from "@/components/ui/text-link";
import { referenceKey } from "@/lib/messaging/reference-token";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** The text of a Markdown syntax node, such as the code inside a fence. */
type TextNode = { value?: string; children?: TextNode[] };
const textOf = (node: TextNode | undefined): string =>
  node?.value ?? (node?.children ?? []).map(textOf).join("");

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
    // Typeset styles the prose; components with a data-slot keep their own styles.
    <div
      data-slot="message-markdown"
      className="typeset typeset-message mt-0.5 min-w-0 text-sm wrap-anywhere"
    >
      <ReactMarkdown
        remarkPlugins={references ? [remarkGfm, remarkWorkspaceReferences] : [remarkGfm]}
        skipHtml
        components={{
          span: ({ node, children }) => (
            <MarkdownReference node={node} references={referencesByKey} loading={referencesLoading}>
              {children}
            </MarkdownReference>
          ),
          a: ({ children, href }) => <TextLink href={href}>{children}</TextLink>,
          pre: ({ node }) => (
            <CodeBlock size="sm">
              <CodeBlockContent>{textOf(node).replace(/\n$/, "")}</CodeBlockContent>
            </CodeBlock>
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
