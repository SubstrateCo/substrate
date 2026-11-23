import type { Mailbox } from "@substrate/contracts/mail";

import { useState } from "react";

import type { LabelActions } from "./label-menu";
import { LabelSettings } from "./label-settings";
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

type Actions = LabelActions & {
  onRename: (id: string, nickname: string) => Promise<void>;
  onReconnect: (
    id: string,
    chooseClient: boolean,
  ) => Promise<"connected" | "different-account" | "cancelled">;
  onDisconnect: (id: string) => Promise<void>;
};

function MailboxSettings({
  box,
  onRename,
  onReconnect,
  onDisconnect,
  onLabelColor,
  onLabelVisibility,
}: { box: Mailbox } & Actions) {
  const [nickname, setNickname] = useState(box.nickname ?? "");
  const [pending, setPending] = useState<"rename" | "reconnect" | "disconnect">();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setPending("rename");
    setError("");
    try {
      await onRename(box.id, nickname.trim());
      setNickname(nickname.trim());
    } catch {
      setError("Couldn’t save the nickname. Try again.");
    } finally {
      setPending(undefined);
    }
  }
  async function reconnect(chooseClient: boolean) {
    setPending("reconnect");
    setError("");
    try {
      const outcome = await onReconnect(box.id, chooseClient);
      if (outcome === "different-account")
        setError(`Choose the Google account for ${box.address}. This connection hasn’t changed.`);
    } catch {
      setError("Couldn’t reconnect Gmail. Try again.");
    } finally {
      setPending(undefined);
    }
  }
  async function disconnect() {
    setPending("disconnect");
    setError("");
    try {
      await onDisconnect(box.id);
      setConfirm(false);
    } catch {
      setError("Couldn’t disconnect the mailbox. Try again.");
    } finally {
      setPending(undefined);
    }
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
          {box.lastSync ? (
            <span>
              Last synced <Timestamp value={box.lastSync} format="datetime" />
            </span>
          ) : (
            <span>No completed sync</span>
          )}
          {box.status === "syncing" && <span>Syncing…</span>}
          {box.status === "reconnect" && <span>Reconnect needed</span>}
          {box.status === "retry" && <span>Sync paused</span>}
        </div>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
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
      <LabelSettings box={box} onLabelColor={onLabelColor} onLabelVisibility={onLabelVisibility} />
      <div className="flex flex-wrap gap-2">
        <PendingButton
          variant="ghost"
          size="xs"
          disabled={!!pending}
          pending={pending === "reconnect"}
          onClick={() => void reconnect(false)}
        >
          Reconnect Gmail
        </PendingButton>
        <Button variant="ghost" size="xs" disabled={!!pending} onClick={() => void reconnect(true)}>
          Choose a different client file
        </Button>
        <Button
          variant="destructive-ghost"
          size="xs"
          disabled={!!pending}
          onClick={() => {
            setError("");
            setConfirm(true);
          }}
        >
          Disconnect
        </Button>
      </div>
      {error && !confirm && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {confirm && (
        <ConfirmDialog
          destructive
          title="Disconnect mailbox?"
          description={`Remove ${box.address} and its cached mail from this workspace on this device. Mail in Gmail stays intact.`}
          confirmLabel="Disconnect mailbox"
          pending={pending === "disconnect"}
          error={error}
          onClose={() => {
            setError("");
            setConfirm(false);
          }}
          onConfirm={() => void disconnect()}
        />
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
