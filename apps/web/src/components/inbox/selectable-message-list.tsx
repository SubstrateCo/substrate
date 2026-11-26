import {
  conversationKey,
  mailMessageActions,
  type MailConversation,
  type MailMessageAction,
} from "@substrate/contracts/mail";
import type { MailAPI } from "@substrate/contracts/mail/ipc";

import { useRef, useState, type ComponentProps } from "react";

import { MailActionButton } from "./mail-action-button";
import { canChangeMail } from "./mailbox-access";
import { MessageList } from "./message-list";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { FormMessage } from "@/components/feedback/form-message";
import { useStateDialog } from "@/components/feedback/use-state-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

type ListProps = Omit<ComponentProps<typeof MessageList>, "checked" | "disabled" | "onCheck">;
type Batch = { rows: MailConversation[]; action: MailMessageAction };
const countLabel = (n: number) => `${n} conversation${n === 1 ? "" : "s"}`;

export function SelectableMessageList({
  onBeginSelection,
  onManage,
  onChange,
  ...list
}: ListProps & {
  onBeginSelection: () => void;
  onManage: () => void;
  onChange: (
    ids: string[],
    action: MailMessageAction,
  ) => ReturnType<MailAPI["changeConversations"]>;
}) {
  const [checked, setChecked] = useState(new Set<string>());
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState<Batch>();
  const selectPage = useRef<HTMLButtonElement>(null);
  const confirm = useStateDialog<Batch>(() => selectPage.current?.focus());
  const chosen = list.messages.filter((row) => checked.has(conversationKey(row)));
  const count = chosen.length;
  const selectionLabel = count ? `${countLabel(count)} selected` : "Select conversations";
  const blocked = (rows: MailConversation[]) =>
    list.mailboxes.filter((b) => !canChangeMail(b) && rows.some((row) => row.mailboxId === b.id));
  const reconnect = blocked(failed?.rows ?? chosen);
  function select(keys: Set<string>) {
    setFailed(undefined);
    setChecked(keys);
    if (keys.size) onBeginSelection();
  }
  function toggle(row: MailConversation) {
    const next = new Set(chosen.map(conversationKey));
    const key = conversationKey(row);
    if (!next.delete(key)) next.add(key);
    select(next);
  }
  async function apply(batch: Batch) {
    setPending(true);
    let remaining = batch.rows;
    try {
      const results = await onChange(
        batch.rows.map((row) => row.id),
        batch.action,
      );
      const done = new Set(
        results.filter((r) => r.result === "updated" || r.result === "missing").map((r) => r.id),
      );
      remaining = batch.rows.filter((row) => !done.has(row.id));
    } catch {
      // A bridge interruption can leave provider outcomes unknown. Keep the exact targets for retry.
    }
    setChecked(new Set(remaining.map(conversationKey)));
    setFailed(remaining.length ? { ...batch, rows: remaining } : undefined);
    setPending(false);
    confirm.close();
    if (!remaining.length) selectPage.current?.focus();
  }
  function start(batch: Batch) {
    if (pending || !batch.rows.length || blocked(batch.rows).length) return;
    if (batch.action === "trashMessage") confirm.open(batch);
    else void apply(batch);
  }
  return (
    <>
      <div
        role="group"
        aria-label="Conversation actions"
        aria-busy={pending}
        className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b px-3 py-1.5"
      >
        <Checkbox
          ref={selectPage}
          aria-label="Select all conversations on this page"
          checked={!count ? false : count === list.messages.length || "indeterminate"}
          disabled={pending}
          onCheckedChange={() =>
            select(
              new Set(count === list.messages.length ? [] : list.messages.map(conversationKey)),
            )
          }
        />
        <span aria-live="polite" className="text-xs text-muted-foreground">
          {pending ? "Updating Gmail…" : selectionLabel}
        </span>
        {count > 0 && (
          <>
            {mailMessageActions.map((action) => (
              <MailActionButton
                key={action}
                action={action}
                disabled={pending || !!reconnect.length}
                onClick={() => start({ action, rows: chosen })}
              />
            ))}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => select(new Set())}
            >
              Clear selection
            </Button>
          </>
        )}
        {!!reconnect.length && (
          <>
            <span className="text-xs text-muted-foreground">
              {reconnect.map((b) => b.address).join(", ")}
            </span>
            <Button type="button" variant="link" size="sm" onClick={onManage}>
              Reconnect to enable Gmail actions
            </Button>
          </>
        )}
      </div>
      {failed && (
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-1">
          <FormMessage
            error={`Gmail hasn’t confirmed ${countLabel(failed.rows.length)}. Retry just ${failed.rows.length === 1 ? `“${failed.rows[0]!.subject || "(No subject)"}”` : "those conversations"}.`}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !!reconnect.length}
            onClick={() => start(failed)}
          >
            Retry remaining
          </Button>
        </div>
      )}
      <MessageList
        {...list}
        checked={checked}
        disabled={pending}
        onCheck={toggle}
        onOpen={(row) => {
          select(new Set());
          list.onOpen(row);
        }}
      />
      {confirm.value && (
        <ConfirmDialog
          destructive
          title={`Move ${countLabel(confirm.value.rows.length)} to Trash?`}
          description="Every email in the selected conversations will move to Gmail Trash, including replies outside this view."
          confirmLabel="Move to Trash"
          pending={pending}
          onClose={confirm.close}
          onRestoreFocus={confirm.restoreFocus}
          onConfirm={() => confirm.value && void apply(confirm.value)}
        />
      )}
    </>
  );
}
