import {
  conversationKey,
  filterLabels,
  type MailConversation,
  type MailMessageAction,
} from "@substrate/contracts/mail";
import type { MailAPI, MailLabelFilter, MailScope } from "@substrate/contracts/mail/ipc";

import { useQueryClient } from "@tanstack/react-query";

import { useState, type RefObject } from "react";

import type { LabelActions } from "./label-menu";
import { localMailQueries } from "@/queries/mail/options";

/** The conversation open in the reader. Closing it returns focus to its row or the search. */
export function useReaderSelection(field: RefObject<HTMLInputElement | null>) {
  const [selected, setSelected] = useState<MailConversation>();
  function focusList() {
    if (document.getElementById("inbox-reader-heading")) return;
    const opener = document
      .getElementById(`message-${selected?.id}`)
      ?.querySelector<HTMLButtonElement>("[data-mail-open]");
    (opener ?? field.current)?.focus();
  }
  function closeReader() {
    const key = selected && conversationKey(selected);
    setSelected((current) => (current && conversationKey(current) === key ? undefined : current));
    requestAnimationFrame(focusList);
  }
  return { selected, setSelected, focusList, closeReader };
}

/** Message, conversation and label changes. Each one reads local mail again. */
export function useMailChanges(
  api: MailAPI,
  scope: MailScope,
  {
    label,
    resetPages,
    closeReader,
    onLabelHidden,
  }: {
    label: MailLabelFilter | undefined;
    resetPages: () => void;
    closeReader: () => void;
    onLabelHidden: () => void;
  },
) {
  const client = useQueryClient();
  const local = localMailQueries(api, scope);
  async function changeMessage(id: string, action: MailMessageAction) {
    const result = await api[action]({ ...scope, id });
    if (result === "updated" || result === "missing") resetPages();
    await client.invalidateQueries({ queryKey: local.root });
    if (result === "missing" || (result === "updated" && action === "trashMessage")) closeReader();
    return result;
  }
  async function changeConversations(ids: string[], action: MailMessageAction) {
    const results = await api.changeConversations({ ...scope, ids, action });
    if (results.some((r) => r.result === "updated" || r.result === "missing")) resetPages();
    await client.invalidateQueries({ queryKey: local.root });
    return results;
  }
  const labelActions: LabelActions = {
    onLabelColor: async (mailboxId, labelId, color) => {
      await api.labelColor({ ...scope, mailboxId, labelId, color });
      await client.invalidateQueries({ queryKey: local.accounts.queryKey });
    },
    onLabelVisibility: async (mailboxId, change) => {
      await api.labelVisibility({ ...scope, mailboxId, change });
      const latest = await client.query({ ...local.accounts, staleTime: 0 });
      if (label?.mailboxId === mailboxId && change.area !== "rows") {
        const box = latest.find((b) => b.id === mailboxId);
        if (!box || !filterLabels(box).some((l) => l.id === label.id)) onLabelHidden();
      }
    },
  };
  return { changeMessage, changeConversations, labelActions };
}
