import {
  mailFlag,
  type Mailbox,
  type MailHeader,
  type MailMessageAction,
} from "@substrate/contracts/mail";
import type { MailActionResult } from "@substrate/contracts/mail/ipc";

import { useMutation } from "@tanstack/react-query";

import { useRef } from "react";

import { useInboxWorkspace } from "../inbox-workspace-context";
import { MailActionButton } from "../mail-action-button";
import { canChangeMail } from "../mailbox-access";
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
const resultErrors: Partial<Record<MailActionResult, string>> = {
  reconnect: "Reconnect this mailbox to change messages in Gmail.",
  retry: "Gmail hasn’t confirmed the change. Try again.",
};

export function ReaderActionBar({
  message,
  mailbox,
  readingElement,
}: {
  message: MailHeader;
  mailbox: Mailbox;
  readingElement: HTMLElement | null;
}) {
  const { onAction, onManage, focusList } = useInboxWorkspace().readerActions;
  const confirm = useStateDialog<"trash">(focusList);
  const mutation = useMutation({
    mutationFn: (action: MailMessageAction) => onAction(message.id, action),
    onSuccess: (result) => {
      if (result !== "retry") confirm.close();
    },
  });
  const pending = mutation.isPending;
  const error = mutation.isError
    ? "Couldn’t change the message. Try again."
    : (mutation.data && resultErrors[mutation.data]) || "";
  const writable = canChangeMail(mailbox);
  const unread = !!(message.flags & mailFlag.unread);
  const acted = useRef(false);
  function change(action: MailMessageAction) {
    acted.current = true;
    mutation.mutate(action);
  }
  useReadDwell(readingElement, writable && unread && !pending && !confirm.value, () => {
    if (!acted.current) change("markRead");
  });
  return (
    <div className="grid min-w-0 gap-1">
      <div role="group" aria-label="Message actions" className="flex flex-wrap items-center gap-1">
        <MailActionButton
          action={unread ? "markRead" : "markUnread"}
          disabled={!writable || pending}
          onClick={() => change(unread ? "markRead" : "markUnread")}
        />
        {!(message.flags & mailFlag.trash) && (
          <MailActionButton
            action="trashMessage"
            disabled={!writable || pending}
            onClick={() => {
              mutation.reset();
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
      {confirm.value ? (
        <ConfirmDialog
          destructive
          title="Move this message to Trash?"
          description={`This moves only this email to Trash in ${mailbox.address}. You can restore it in Gmail.`}
          confirmLabel="Move to Trash"
          pending={pending}
          error={error}
          onClose={() => {
            mutation.reset();
            confirm.close();
          }}
          onRestoreFocus={confirm.restoreFocus}
          onConfirm={() => change("trashMessage")}
        />
      ) : (
        <FormMessage error={error} />
      )}
    </div>
  );
}
