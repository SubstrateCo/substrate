import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { WorkspaceSearch, type SearchKind } from "@startup-os/ui/context/workspace-search";

function SearchPreview({
  state = "ready",
}: {
  state?: "ready" | "loading" | "error" | "empty" | "refresh-error" | "unavailable";
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<SearchKind>("all");
  const [related, setRelated] = useState(false);
  const [after, setAfter] = useState(false);
  const [retried, setRetried] = useState(false);
  const [closed, setClosed] = useState(false);
  const failed = !retried && ["error", "refresh-error", "unavailable"].includes(state);
  const error = failed
    ? Object.assign(new Error("Search failed"), { status: state === "unavailable" ? 403 : 503 })
    : null;
  const results =
    state === "empty" || state === "loading" || (failed && state === "error")
      ? []
      : [
          {
            id: "task",
            kind: "task",
            title: after ? "Review release notes" : "Ship the launch",
            href: "#task",
          },
          { id: "project", kind: "project", title: "Product launch", href: "#project" },
          {
            id: "message",
            kind: "message",
            title: "Please review the launch plan",
            href: "#message",
          },
          { id: "conversation", kind: "conversation", title: "Launch team", href: "#conversation" },
        ].filter(
          (item) =>
            (kind === "all" || item.kind === kind) &&
            item.title.toLowerCase().includes(query.toLowerCase()),
        );
  if (closed) return <p role="status">Search closed.</p>;
  return (
    <WorkspaceSearch
      query={query}
      kind={kind}
      related={related}
      results={results}
      loading={state === "loading"}
      error={error}
      hasMore={!after && !!results.length}
      hasPrevious={after}
      onQueryChange={setQuery}
      onKindChange={setKind}
      onRelated={() => {
        setRelated(true);
        setQuery("");
        setKind("all");
      }}
      onClearRelated={() => setRelated(false)}
      onMore={() => setAfter(true)}
      onFirst={() => setAfter(false)}
      onRetry={() => setRetried(true)}
      onClose={() => setClosed(true)}
    />
  );
}

const meta = { title: "Workspace/Search", component: SearchPreview } satisfies Meta<
  typeof SearchPreview
>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Ready: Story = {};
export const Loading: Story = { args: { state: "loading" } };
export const LoadError: Story = { args: { state: "error" } };
export const Empty: Story = { args: { state: "empty" } };
export const RefreshError: Story = { args: { state: "refresh-error" } };
export const Unavailable: Story = { args: { state: "unavailable" } };
export const Dark: Story = { globals: { theme: "dark" } };
export const Narrow: Story = { globals: { viewport: { value: "narrow" } } };
