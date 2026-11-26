import { CodeBlock, CodeBlockContent } from "@/components/ui/code-block";
import { TextLink } from "@/components/ui/text-link";
import ReactMarkdown, { type Options } from "react-markdown";
import remarkGfm from "remark-gfm";

/** The text of a Markdown syntax node, such as the code inside a fence. */
type TextNode = { value?: string; children?: TextNode[] };
const textOf = (node: TextNode | undefined): string =>
  node?.value ?? (node?.children ?? []).map(textOf).join("");

// Kept at module scope, so react-markdown sees the same components on every render.
const renderers = {
  a: ({ children, href }) => <TextLink href={href}>{children}</TextLink>,
  table: ({ children }) => (
    <div
      className="typeset-scroll sm:overflow-visible"
      role="region"
      aria-label="Message table"
      tabIndex={0}
    >
      {/* oxlint-disable-next-line design/no-native-element -- Markdown tables are authored content, not application data for AppTable. */}
      <table className="sm:w-auto sm:max-w-full">{children}</table>
    </div>
  ),
  pre: ({ node }) => (
    <CodeBlock size="sm">
      <CodeBlockContent>{textOf(node).replace(/\n$/, "")}</CodeBlockContent>
    </CodeBlock>
  ),
  img: ({ alt }) => <span className="text-muted-foreground">[Image: {alt || "attachment"}]</span>,
} satisfies Options["components"];

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
        components={{ ...components, ...renderers }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
