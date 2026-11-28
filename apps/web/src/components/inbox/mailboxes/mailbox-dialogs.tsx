import type { Mailbox } from "@substrate/contracts/mail";
import type { MailAPI, MailScope } from "@substrate/contracts/mail/ipc";

import { useQueryClient } from "@tanstack/react-query";

import { ConnectMailbox } from "./connect-mailbox";
import { ManageMailboxes } from "./manage-mailboxes";
import type { useStateDialog } from "@/components/feedback/use-state-dialog";
import { localMailQueries } from "@/queries/mail/options";

export type MailboxDialog = ReturnType<typeof useStateDialog<"connect" | "manage">>;

export function MailboxDialogs({
  api,
  scope,
  dialog,
  boxes,
  onConnected,
  onDisconnected,
}: {
  api: MailAPI;
  scope: MailScope;
  dialog: MailboxDialog;
  boxes: Mailbox[];
  onConnected: (mailboxId: string) => void;
  onDisconnected: (mailboxId: string) => void;
}) {
  const client = useQueryClient();
  const local = localMailQueries(api, scope);
  if (dialog.value === "connect")
    return (
      <ConnectMailbox
        hasMailboxes={boxes.length > 0}
        onClose={dialog.close}
        onRestoreFocus={dialog.restoreFocus}
        onConnect={async (nickname, chooseClient) => {
          const id = await api.connectGmail({ ...scope, nickname, chooseClient });
          if (id === null) return false;
          onConnected(id);
          await client.invalidateQueries({ queryKey: local.root });
          return true;
        }}
      />
    );
  if (dialog.value === "manage")
    return (
      <ManageMailboxes
        boxes={boxes}
        onClose={dialog.close}
        onRestoreFocus={dialog.restoreFocus}
        onRename={async (mailboxId, nickname) => {
          await api.rename({ ...scope, mailboxId, nickname });
          await client.invalidateQueries({ queryKey: local.accounts.queryKey });
        }}
        onReconnect={async (mailboxId, chooseClient) => {
          const result = await api.reconnectGmail({ ...scope, mailboxId, chooseClient });
          if (result === "connected") await client.invalidateQueries({ queryKey: local.root });
          return result;
        }}
        onDisconnect={async (mailboxId) => {
          await api.disconnect({ ...scope, mailboxId });
          onDisconnected(mailboxId);
          await client.cancelQueries({ queryKey: local.root });
          await client.resetQueries({ queryKey: local.root });
        }}
      />
    );
  return null;
}
