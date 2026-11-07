import { useEffect, useRef, useState, type ReactNode } from "react";

import { FormMessage } from "../auth/form-message";
import { PendingButton } from "../feedback/pending-button";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import type { Conversation } from "./types";

export type ConversationDraft = { name: string; emails: string; isPrivate: boolean };

export function CreateConversationForm({
  kind,
  onSubmit,
  onCancel,
  pending = false,
  error,
  children,
}: {
  kind: Conversation["kind"];
  onSubmit: (draft: ConversationDraft) => void;
  onCancel: () => void;
  pending?: boolean;
  error?: Error | null;
  children?: ReactNode;
}) {
  const [name, setName] = useState("");
  const [emails, setEmails] = useState("");
  const [isPrivate, setPrivate] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    form.current?.querySelector("input")?.focus();
  }, []);
  const title = {
    channel: "Create a channel",
    dm: "New direct message",
    group: "New group message",
  }[kind];
  return (
    <section className="m-auto w-full max-w-xl shrink-0 p-6 sm:p-10">
      <h2 className="mb-7 text-xl font-semibold tracking-tight">{title}</h2>
      <form
        ref={form}
        className="space-y-5"
        onKeyDown={(event) => {
          if (
            event.key === "Escape" &&
            !event.defaultPrevented &&
            !event.nativeEvent.isComposing &&
            !pending
          ) {
            event.preventDefault();
            onCancel();
          }
        }}
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
        {children}
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
        <div className="flex flex-wrap gap-2">
          <PendingButton
            type="submit"
            className="min-w-36"
            pending={pending}
            pendingLabel="Creating…"
          >
            {kind === "channel" ? "Create channel" : "Start conversation"}
          </PendingButton>
          <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </section>
  );
}
