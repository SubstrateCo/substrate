import {
  mailFlag,
  type Mailbox,
  type MailHeader,
  type MailMessageAction,
} from "@substrate/contracts/mail";
import type { MailActionResult } from "@substrate/contracts/mail/ipc";

import { useRef, useState } from "react";

import { canChangeMail, MailActionButton } from "./mail-action-button";
import { useReadDwell } from "./use-read-dwell";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { FormMessage } from "@/components/feedback/form-message";
import { useStateDialog } from "@/components/feedback/use-state-dialog";
import { Button } from "@/components/ui/button";

export type ReaderActions = {
  onAction: (id: string, action: MailMessageAction) => Promise<MailActionResult>;
  onManage: () => void;
  focusList: () => void;
};
export function ReaderActionBar({
  message,
  mailbox,
  onAction,
  onManage,
  focusList,
  readingElement,
}: ReaderActions & {
  message: MailHeader;
  mailbox: Mailbox;
  readingElement: HTMLElement | null;
}) {
  const confirm = useStateDialog<"trash">(focusList);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const writable = canChangeMail(mailbox);
  const unread = !!(message.flags & mailFlag.unread);
  const acted = useRef(false);
  useReadDwell(readingElement, writable && unread && !pending && !confirm.value, () => {
    if (!acted.current) void change("markRead");
  });
  async function change(action: MailMessageAction) {
    acted.current = true;
    setError("");
    setPending(true);
    try {
      const result = await onAction(message.id, action);
      if (result === "reconnect") {
        confirm.close();
        setError("Reconnect this mailbox to change messages in Gmail.");
      } else if (result === "retry") setError("Gmail hasn’t confirmed the change. Try again.");
      else confirm.close();
    } catch {
      setError("Couldn’t change the message. Try again.");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="grid min-w-0 gap-1">
      <div role="group" aria-label="Message actions" className="flex flex-wrap items-center gap-1">
        <MailActionButton
          action={unread ? "markRead" : "markUnread"}
          disabled={!writable || pending}
          onClick={() => void change(unread ? "markRead" : "markUnread")}
        />
        {!(message.flags & mailFlag.trash) && (
          <MailActionButton
            action="trashMessage"
            disabled={!writable || pending}
            onClick={() => {
              setError("");
              confirm.open("trash");
            }}
          />
        )}
        {!writable && (
          <Button variant="outline" size="sm" onClick={onManage}>
            Reconnect
            <span className="sr-only @md:not-sr-only"> to enable Gmail actions</span>
          </Button>
        )}
      </div>
      {!confirm.value && <FormMessage error={error} />}
      {confirm.value && (
        <ConfirmDialog
          destructive
          title="Move this message to Trash?"
          description={`This moves only this email to Trash in ${mailbox.address}. You can restore it in Gmail.`}
          confirmLabel="Move to Trash"
          pending={pending}
          error={error}
          onClose={() => {
            setError("");
            confirm.close();
          }}
          onRestoreFocus={confirm.restoreFocus}
          onConfirm={() => void change("trashMessage")}
        />
      )}
    </div>
  );
}
