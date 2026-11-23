import { ContentNotice } from "@/components/feedback/content-notice";
import { PendingButton } from "@/components/feedback/pending-button";
import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";

export function AgentMessagesEmpty({
  name,
  enabled,
  pending,
  onStart,
  onSettings,
}: {
  name: string;
  enabled: boolean;
  pending: boolean;
  onStart: () => void;
  onSettings: () => void;
}) {
  return (
    <ContentNotice
      icon={MessageCircle}
      title={enabled ? "No conversation yet" : "Agent is disabled"}
      description={
        enabled
          ? `Start a private conversation with ${name}. This won’t send a message or wake the agent.`
          : `Enable ${name} in Settings before starting a conversation.`
      }
      action={
        enabled ? (
          <PendingButton pending={pending} onClick={onStart}>
            Start conversation
          </PendingButton>
        ) : (
          <Button onClick={onSettings}>Open settings</Button>
        )
      }
    />
  );
}
