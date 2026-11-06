import { useState } from "react";
import type { Conversation } from "./types";
import { PendingButton } from "../feedback/pending-button";
import { Input } from "../primitives/input";
import { Label } from "../primitives/label";
import { FormMessage } from "../auth/form-message";

export type ConversationDraft = { name: string; emails: string; isPrivate: boolean };

export function CreateConversationForm({
  kind,
  onSubmit,
  pending = false,
  error,
}: {
  kind: Conversation["kind"];
  onSubmit: (draft: ConversationDraft) => void;
  pending?: boolean;
  error?: Error | null;
}) {
  const [name, setName] = useState("");
  const [emails, setEmails] = useState("");
  const [isPrivate, setPrivate] = useState(false);
  const title = {
    channel: "Create a channel",
    dm: "New direct message",
    group: "New group message",
  }[kind];
  return (
    <section className="m-auto w-full max-w-xl shrink-0 p-6 sm:p-10">
      <h2 className="mb-7 text-xl font-semibold tracking-tight">{title}</h2>
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (pending) return;
          onSubmit({ name, emails, isPrivate });
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
              disabled={pending}
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
            disabled={pending}
            required={kind !== "channel"}
            aria-describedby="recipient-help"
          />
          <p id="recipient-help" className="text-xs leading-relaxed text-muted-foreground">
            Enter exact email addresses, separated by commas. People in other workspaces can be
            included. They must already have an account.
          </p>
        </div>
        {kind === "channel" && (
          <Label>
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(event) => setPrivate(event.target.checked)}
              disabled={pending}
            />
            Make this channel private
          </Label>
        )}
        <FormMessage
          error={error}
          errorDescription="We couldn’t create this conversation. Check the recipients and try again."
        />
        <PendingButton type="submit" pending={pending} pendingLabel="Creating…">
          {kind === "channel" ? "Create channel" : "Start conversation"}
        </PendingButton>
      </form>
    </section>
  );
}
