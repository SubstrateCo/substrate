import { CodeBlock, CodeBlockContent } from "@/components/ui/code-block";
import { TextLink } from "@/components/ui/text-link";
import ReactMarkdown, { type Options } from "react-markdown";
import remarkGfm from "remark-gfm";

type TextNode = { value?: string; children?: TextNode[] };
const textOf = (node: TextNode | undefined): string =>
  node?.value ?? (node?.children ?? []).map(textOf).join("");

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
