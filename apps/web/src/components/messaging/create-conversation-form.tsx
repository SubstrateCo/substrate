import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { parseRecipientEmails, type Conversation } from "@/lib/messaging";
import { queryKeys } from "@/queries/keys";
import { createConversation } from "@/server/messaging";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormMessage } from "@/components/auth/form-message";

export function CreateConversationForm({
  organizationId,
  kind,
  onCreated,
  onClose,
}: {
  organizationId: string;
  kind: Conversation["kind"];
  onCreated: (id: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [emails, setEmails] = useState("");
  const [isPrivate, setPrivate] = useState(false);
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: async () => {
      const recipients = parseRecipientEmails(emails);
      if (kind !== "channel" && !recipients.length)
        throw new Error("Enter at least one recipient email address.");
      if (kind === "dm" && recipients.length !== 1)
        throw new Error("Use a group message for more than one recipient.");
      if (kind === "group" && recipients.length < 2)
        throw new Error("Enter at least two recipients for a group message.");
      if (kind === "channel" && !name.trim()) throw new Error("Enter a channel name.");
      return createConversation({
        data: {
          organizationId,
          kind,
          name: name.trim() || undefined,
          private: kind !== "channel" || isPrivate,
          emails: recipients,
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.conversations(organizationId) });
    },
  });
  const title =
    kind === "channel"
      ? "Create a channel"
      : kind === "dm"
        ? "New direct message"
        : "New group message";
  return (
    <section className="mx-auto w-full max-w-xl p-6 sm:p-10">
      <div className="mb-7 flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <Button variant="ghost" size="icon" aria-label="Cancel new conversation" onClick={onClose}>
          <X />
        </Button>
      </div>
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate(undefined, { onSuccess: (conversation) => onCreated(conversation.id) });
        }}
      >
        {kind !== "dm" && (
          <div className="space-y-2">
            <Label htmlFor="conversation-name">
              {kind === "channel" ? "Channel name" : "Group name (optional)"}
            </Label>
            <Input
              id="conversation-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={kind === "channel" ? "e.g. product-updates" : "e.g. Launch team"}
              maxLength={80}
              disabled={create.isPending}
              required={kind === "channel"}
            />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="recipient-emails">
            {kind === "channel" ? "Add people (optional)" : "To"}
          </Label>
          <Input
            id="recipient-emails"
            value={emails}
            onChange={(event) => setEmails(event.target.value)}
            placeholder="alex@company.com, sam@partner.com"
            disabled={create.isPending}
            required={kind !== "channel"}
            aria-describedby="recipient-help"
          />
          <p id="recipient-help" className="text-xs leading-relaxed text-muted-foreground">
            Enter exact email addresses, separated by commas. People in other workspaces can be
            included. They must already have an account.
          </p>
        </div>
        {kind === "channel" && (
          <Label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(event) => setPrivate(event.target.checked)}
              disabled={create.isPending}
            />
            Make this channel private
          </Label>
        )}
        <FormMessage error={create.error} />
        <Button type="submit" disabled={create.isPending}>
          {create.isPending
            ? "Creating…"
            : kind === "channel"
              ? "Create channel"
              : "Start conversation"}
        </Button>
      </form>
    </section>
  );
}
