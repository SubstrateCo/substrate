import type { Mailbox, MailMessageAction } from "@substrate/contracts/mail";

import { RowAction } from "@/components/layout/row-actions";
import { Button } from "@/components/ui/button";
import { Mail, MailOpen, Trash2 } from "lucide-react";

const actions = {
  markRead: { label: "Mark as read", icon: MailOpen },
  markUnread: { label: "Mark as unread", icon: Mail },
  trashMessage: { label: "Move to Trash", icon: Trash2 },
};

export const canChangeMail = (box: Mailbox) => box.canModify && box.status !== "reconnect";

export function MailActionButton({
  action,
  disabled,
  onClick,
}: {
  action: MailMessageAction;
  disabled: boolean;
  onClick: () => void;
}) {
  const { label, icon: Icon } = actions[action];
  if (action === "trashMessage")
    return (
      <RowAction destructive label={label} disabled={disabled} onClick={onClick}>
        <Icon aria-hidden className="text-destructive" />
      </RowAction>
    );
  return (
    <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={onClick}>
      <Icon aria-hidden data-icon="inline-start" />
      {label}
    </Button>
  );
}
