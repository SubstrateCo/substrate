export type Discussion = {
  messageId: string;
  purpose: string;
  href: string;
  conversationName: string | null;
  authorName: string | null;
  createdAt: string;
  body: string;
};

export function DiscussionItem({ item }: { item: Discussion }) {
  return (
    <div className="space-y-1 rounded-lg border p-3 text-sm">
      <a className="font-medium underline" href={item.href}>
        {item.purpose === "source" ? "Created from a discussion" : "Related discussion"} ·{" "}
        {item.conversationName ?? "Direct conversation"}
      </a>
      <p className="text-muted-foreground">
        {item.authorName} ·{" "}
        <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time>
      </p>
      <p className="line-clamp-3 whitespace-pre-wrap wrap-anywhere">
        {item.body.replace(/@\[[^\]]+\]/g, "[Reference]")}
      </p>
    </div>
  );
}
