import type { Mailbox } from "@substrate/contracts/mail";

import { useMutation } from "@tanstack/react-query";

import { useState } from "react";

import { LabelSettings } from "../label-settings";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { modalDialogProps } from "@/components/feedback/modal-dialog";
import { PendingButton } from "@/components/feedback/pending-button";
import { Timestamp } from "@/components/time/timestamp";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";

type Actions = {
  onRename: (id: string, nickname: string) => Promise<void>;
  onReconnect: (
    id: string,
    chooseClient: boolean,
  ) => Promise<"connected" | "different-account" | "cancelled">;
  onDisconnect: (id: string) => Promise<void>;
};

const statusNotes: Partial<Record<Mailbox["status"], string>> = {
  syncing: "Syncing…",
  reconnect: "Reconnect needed",
  retry: "Sync paused",
};

type Outcome = { isPending: boolean; isError: boolean };

/** The action in progress. The actions disable each other, so at most one runs. */
function pendingAction(actions: Record<"rename" | "reconnect" | "disconnect", Outcome>) {
  if (actions.rename.isPending) return "rename";
  if (actions.reconnect.isPending) return "reconnect";
  if (actions.disconnect.isPending) return "disconnect";
}

/** The one error line the actions share. */
function settingsError(
  box: Mailbox,
  {
    rename,
    reconnect,
    disconnect,
  }: {
    rename: Outcome;
    reconnect: Outcome & { data?: string };
    disconnect: Outcome;
  },
) {
  if (rename.isError) return "Couldn’t save the nickname. Try again.";
  if (reconnect.isError) return "Couldn’t reconnect Gmail. Try again.";
  if (reconnect.data === "different-account")
    return `Choose the Google account for ${box.address}. This connection hasn’t changed.`;
  if (disconnect.isError) return "Couldn’t disconnect the mailbox. Try again.";
  return "";
}

function MailboxSettings({ box, onRename, onReconnect, onDisconnect }: { box: Mailbox } & Actions) {
  const [nickname, setNickname] = useState(box.nickname ?? "");
  const [confirm, setConfirm] = useState(false);
  const rename = useMutation({
    mutationFn: (value: string) => onRename(box.id, value),
    onSuccess: (_, value) => setNickname(value),
  });
  const reconnect = useMutation({
    mutationFn: (chooseClient: boolean) => onReconnect(box.id, chooseClient),
  });
  const disconnect = useMutation({
    mutationFn: () => onDisconnect(box.id),
    onSuccess: () => setConfirm(false),
  });
  const pending = pendingAction({ rename, reconnect, disconnect });
  const error = settingsError(box, { rename, reconnect, disconnect });
  // The three actions share one error line, so each start clears the others' outcome.
  function clearError() {
    rename.reset();
    reconnect.reset();
    disconnect.reset();
  }
  return (
    <section
      aria-label={box.address}
      className="min-w-0 space-y-3 border-b pb-4 last:border-b-0 last:pb-0"
    >
      <div>
        <Heading level={2} variant="title" className="wrap-anywhere">
          {box.address}
        </Heading>
        <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
          <span>{box.canModify ? "Gmail actions enabled" : "Read-only Gmail access"}</span>
          {box.lastSync ? (
            <span>
              Last synced <Timestamp value={box.lastSync} format="datetime" />
            </span>
          ) : (
            <span>No completed sync</span>
          )}
          {statusNotes[box.status] && <span>{statusNotes[box.status]}</span>}
        </div>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          clearError();
          rename.mutate(nickname.trim());
        }}
      >
        <Field>
          <FieldLabel htmlFor={`nickname-${box.id}`}>Nickname (optional)</FieldLabel>
          <div className="flex min-w-0 items-center gap-2">
            <Input
              id={`nickname-${box.id}`}
              value={nickname}
              maxLength={80}
              placeholder="Use the email address"
              disabled={!!pending}
              onChange={(e) => setNickname(e.target.value)}
            />
            <PendingButton
              type="submit"
              variant="outline"
              size="sm"
              pending={pending === "rename"}
              disabled={!!pending || nickname.trim() === (box.nickname ?? "")}
            >
              Save
            </PendingButton>
          </div>
        </Field>
      </form>
      <LabelSettings box={box} />
      <div className="flex flex-wrap gap-2">
        <PendingButton
          variant="ghost"
          size="xs"
          disabled={!!pending}
          pending={pending === "reconnect"}
          onClick={() => {
            clearError();
            reconnect.mutate(false);
          }}
        >
          {box.canModify ? "Reconnect Gmail" : "Reconnect to enable Gmail actions"}
        </PendingButton>
        <Button
          variant="ghost"
          size="xs"
          disabled={!!pending}
          onClick={() => {
            clearError();
            reconnect.mutate(true);
          }}
        >
          Choose a different client file
        </Button>
        <Button
          variant="destructive-ghost"
          size="xs"
          disabled={!!pending}
          onClick={() => {
            clearError();
            setConfirm(true);
          }}
        >
          Disconnect
        </Button>
      </div>
      {confirm ? (
        <ConfirmDialog
          destructive
          title="Disconnect mailbox?"
          description={`Remove ${box.address} and its cached mail from this workspace on this device. Mail in Gmail stays intact.`}
          confirmLabel="Disconnect mailbox"
          pending={pending === "disconnect"}
          error={error}
          onClose={() => {
            clearError();
            setConfirm(false);
          }}
          onConfirm={() => {
            clearError();
            disconnect.mutate();
          }}
        />
      ) : (
        error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )
      )}
    </section>
  );
}

export function ManageMailboxes({
  boxes,
  onClose,
  onRestoreFocus,
  ...actions
}: {
  boxes: Mailbox[];
  onClose: () => void;
  onRestoreFocus: () => void;
} & Actions) {
  const modal = modalDialogProps({ onClose, onRestoreFocus });
  return (
    <Dialog {...modal.root}>
      <DialogContent {...modal.content}>
        <DialogHeader>
          <DialogTitle>Manage mailboxes</DialogTitle>
          <DialogDescription>Connections on this device.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          {boxes.map((box) => (
            <MailboxSettings key={box.id} box={box} {...actions} />
          ))}
          {!boxes.length && <p className="text-sm text-muted-foreground">No connected mailboxes</p>}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
