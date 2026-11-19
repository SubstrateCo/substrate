import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { useEffect, useRef, useState, type ReactElement } from "react";

import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { PendingButton } from "@/components/feedback/pending-button";
import { PersonCard } from "@/components/messaging/people/person-card-view";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDirectMessage } from "@/queries/messaging/conversations";
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
  const { mode, onOpenChange, enter, leave, clearTimer, activated } = usePersonCardDisclosure();
  const content = useRef<HTMLDivElement>(null);
  return (
    <Popover open={mode !== "closed"} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="max-w-full rounded-sm text-left align-baseline focus-visible:outline-2 focus-visible:outline-ring"
          onPointerEnter={(event) => {
            if (event.pointerType === "mouse") enter();
          }}
          onPointerLeave={leave}
          onClick={(event) => {
            if (mode !== "preview") return;
            // Activate the visible preview rather than toggling it closed.
            event.preventDefault();
            onOpenChange(true);
            content.current?.focus();
          }}
        >
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent
        ref={content}
        aria-label={`${name} profile`}
        side="bottom"
        align="start"
        collisionPadding={8}
        className="w-76"
        onPointerEnter={clearTimer}
        onPointerLeave={leave}
        onOpenAutoFocus={(event) => {
          if (!activated.current) event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          if (!activated.current) event.preventDefault();
        }}
      >
        <PersonHoverCardBody
          organizationId={organizationId}
          conversationId={conversationId}
          actorId={actorId}
          name={name}
          onClose={() => onOpenChange(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

function usePersonCardDisclosure() {
  const [mode, setMode] = useState<"closed" | "preview" | "activated">("closed");
  const activated = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const clearTimer = () => clearTimeout(timer.current);
  useEffect(() => () => clearTimeout(timer.current), []);
  return {
    mode,
    activated,
    clearTimer,
    onOpenChange: (open: boolean) => {
      clearTimer();
      if (open) activated.current = true;
      setMode(open ? "activated" : "closed");
    },
    enter: () => {
      clearTimer();
      if (mode !== "closed") return;
      timer.current = setTimeout(() => {
        activated.current = false;
        setMode("preview");
      }, 400);
    },
    leave: () => {
      clearTimer();
      if (mode !== "preview") return;
      timer.current = setTimeout(() => setMode("closed"), 150);
    },
  };
}

/** The card's content. It mounts only while the card is open, so closed cards hold no queries. */
function PersonHoverCardBody({
  organizationId,
  conversationId,
  actorId,
  name,
  onClose,
}: {
  organizationId: string;
  conversationId: string;
  actorId: string;
  name: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  // Details load when the card opens. The server checks conversation access each time.
  const profile = useQuery(messagingProfileOptions(organizationId, conversationId, actorId));
  const directMessage = useDirectMessage(organizationId);
  const openDirectMessage = () => {
    if (!profile.data?.email) return;
    directMessage.mutate(
      { id: profile.data.directConversationId, emails: [profile.data.email] },
      {
        onSuccess: ({ id }) => {
          onClose();
          void navigate({
            to: "/dashboard",
            search: { workspaceId: organizationId, conversationId: id },
          });
        },
        onError: (error) =>
          toast.error(actionErrorMessage(error, "We couldn’t open this conversation. Try again.")),
      },
    );
  };
  const data = profile.data;
  const canMessage = data?.type === "human" && !data.self && !data.external && !!data.email;
  let state: "loading" | "unavailable" | "ready" = "ready";
  if (profile.isPending) state = "loading";
  else if (profile.isError) state = "unavailable";
  return (
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
              pending={directMessage.isPending}
              pendingLabel="Opening conversation."
              onClick={openDirectMessage}
            >
              <MessageSquare aria-hidden="true" />
              Message
            </PendingButton>
          )
        }
      />
    </div>
  );
}
