import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./message-markdown.css";

export function MessageMarkdown({ body }: { body: string }) {
  return (
    <div className="message-markdown mt-0.5 text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-700 underline"
            >
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
