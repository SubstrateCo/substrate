import { ContentNotice } from "@/components/feedback/content-notice";
import { Button } from "@/components/ui/button";

export function WorkspaceEmpty({ onCreate }: { onCreate: (kind: "channel" | "dm") => void }) {
  return (
    <div className="m-auto flex max-w-md flex-col items-center p-6 text-center">
      <ContentNotice
        title="Your conversations start here"
        description="Create a channel for your team, or send someone a direct message."
      />
      <div className="flex flex-wrap justify-center gap-2">
        <Button data-create-conversation="empty-channel" onClick={() => onCreate("channel")}>
          Create channel
        </Button>
        <Button
          data-create-conversation="empty-dm"
          variant="outline"
          onClick={() => onCreate("dm")}
        >
          New direct message
        </Button>
      </div>
    </div>
  );
}
