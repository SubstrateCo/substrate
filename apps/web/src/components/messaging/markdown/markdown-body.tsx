import { CodeBlock, CodeBlockContent } from "@/components/ui/code-block";
import { TextLink } from "@/components/ui/text-link";
import ReactMarkdown, { type Options } from "react-markdown";
import remarkGfm from "remark-gfm";

/** The text of a Markdown syntax node, such as the code inside a fence. */
type TextNode = { value?: string; children?: TextNode[] };
const textOf = (node: TextNode | undefined): string =>
  node?.value ?? (node?.children ?? []).map(textOf).join("");

/** Both messages and imported notes render text without executing HTML or loading remote images. */
export function MarkdownBody({
  body,
  remarkPlugins = [],
  components,
}: {
  body: string;
  remarkPlugins?: NonNullable<Options["remarkPlugins"]>;
  components?: Options["components"];
}) {
  return (
    <div
      data-slot="message-markdown"
      className="typeset typeset-message mt-0.5 min-w-0 text-sm wrap-anywhere"
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, ...remarkPlugins]}
        skipHtml
        components={{
          ...components,
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
