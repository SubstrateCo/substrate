import { useWorkspaceSearch } from "@/components/context/search/workspace-search-context";
import { ContentNotice } from "@/components/feedback/content-notice";
import { Button } from "@/components/ui/button";
import type { Conversation } from "@/lib/messaging/conversations";
import { MessageCircle } from "lucide-react";

export function WorkspaceEmpty({ onCreate }: { onCreate: (kind: Conversation["kind"]) => void }) {
  const { openSearch } = useWorkspaceSearch();
  return (
    <ContentNotice
      icon={MessageCircle}
      title="Your conversations start here"
      description="Create a channel for your team, join an existing one, or message someone directly."
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => onCreate("channel")}>New channel</Button>
          <Button variant="outline" onClick={() => openSearch("channel")}>
            Browse channels
          </Button>
        </div>
      }
    />
  );
}
