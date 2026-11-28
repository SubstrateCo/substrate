import { ContentNotice } from "@/components/feedback/content-notice";
import { Button } from "@/components/ui/button";
import { UserRound } from "lucide-react";

/** The empty state while only the signed-in user's interactions show. */
export function OwnInteractionsNotice({ onShowEveryone }: { onShowEveryone: () => void }) {
  return (
    <ContentNotice
      title="You haven’t logged interactions in this period"
      icon={UserRound}
      description="Only interactions you logged are shown. Include your teammates’ interactions, or create one."
      action={
        <Button variant="outline" size="sm" onClick={onShowEveryone}>
          Show everyone’s interactions
        </Button>
      }
    />
  );
}
