import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { useState, type ReactElement } from "react";

import { createConversation } from "@/api/messaging/requests";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { PendingButton } from "@/components/feedback/pending-button";
import { PersonCard } from "@/components/messaging/people/person-card-view";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { queryKeys } from "@/queries/keys";
import { messagingProfileOptions } from "@/queries/messaging/profiles";
import { MessageSquare } from "lucide-react";
import { toast } from "sonner";

export function PersonHoverCard({
  organizationId,
  conversationId,
  actorId,
  name,
  children,
}: {
  organizationId: string;
  conversationId: string;
  actorId: string;
  name: string;
  children: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  // Load details only when the card opens. The server checks conversation access each time.
  const profile = useQuery({
    ...messagingProfileOptions(organizationId, conversationId, actorId),
    enabled: open,
  });
  const directMessage = useMutation({
    mutationFn: async ({ id, email }: { id: string | null; email: string }) =>
      id ??
      (
        await createConversation({
          data: { organizationId, kind: "dm", private: true, emails: [email] },
        })
      ).id,
    onSuccess: async (id, { id: existing }) => {
      if (!existing)
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.conversations(organizationId) }),
          queryClient.invalidateQueries({
            queryKey: [...queryKeys.messaging(organizationId), "profiles"],
          }),
        ]);
      setOpen(false);
      void navigate({
        to: "/dashboard",
        search: { workspaceId: organizationId, conversationId: id },
      });
    },
    onError: (error) =>
      toast.error(actionErrorMessage(error, "We couldn’t open this conversation. Try again.")),
  });
  const data = profile.data;
  const canMessage = data?.type === "human" && !data.self && !data.external && !!data.email;
  let state: "loading" | "unavailable" | "ready" = "ready";
  if (profile.isPending) state = "loading";
  else if (profile.isError) state = "unavailable";
  return (
    <HoverCard open={open} onOpenChange={setOpen} openDelay={400} closeDelay={150}>
      <HoverCardTrigger asChild>
        <span
          tabIndex={0}
          className="rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
        >
          {children}
        </span>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-76">
        <div className="p-0.5">
          <PersonCard
            state={state}
            name={name}
            profile={data}
            action={
              canMessage && (
                <PendingButton
                  size="sm"
                  variant="outline"
                  className="w-full"
                  pending={directMessage.isPending}
                  pendingLabel="Opening conversation…"
                  onClick={() =>
                    directMessage.mutate({ id: data.directConversationId, email: data.email! })
                  }
                >
                  <MessageSquare aria-hidden="true" />
                  Message
                </PendingButton>
              )
            }
          />
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
