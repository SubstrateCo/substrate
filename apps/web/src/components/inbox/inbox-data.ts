import type { Mailbox, MailConversation } from "@substrate/contracts/mail";
import type {
  MailAPI,
  MailFolder,
  MailLabelFilter,
  MailScope,
} from "@substrate/contracts/mail/ipc";

import { useQuery } from "@tanstack/react-query";

import { useState } from "react";

import { useMailPages } from "./mail-paging";
import { localMailQueries, mailRevision } from "@/queries/mail/options";

type LocalMail = ReturnType<typeof localMailQueries>;

/** Connected mailboxes and their sync revision. */
export function useMailAccounts(local: LocalMail) {
  const accounts = useQuery({
    ...local.accounts,
    refetchInterval: (q) => (q.state.data?.some((b) => b.status === "syncing") ? 1500 : false),
  });
  const boxes = accounts.data ?? [];
  const revision = accounts.data && mailRevision(accounts.data);
  return { accounts, boxes, revision };
}

/** The chosen mailbox, and the sync state of the mailboxes in scope (all when none is chosen). */
export function mailboxStatus(boxes: Mailbox[], account: string | null) {
  const inScope = (b: Mailbox) => !account || b.id === account;
  return {
    active: boxes.find((b) => b.id === account) ?? null,
    busy: boxes.some((b) => inScope(b) && b.status === "syncing"),
    problem: boxes.find((b) => inScope(b) && (b.status === "retry" || b.status === "reconnect")),
  };
}

/** The label filter, kept only while its mailbox still has the label. */
export function labelFilter(boxes: readonly Mailbox[], label: MailLabelFilter | undefined) {
  const selectedLabel = boxes
    .find((b) => b.id === label?.mailboxId)
    ?.labels.find((l) => l.id === label?.id);
  return { selectedLabel, filter: selectedLabel ? label : undefined };
}

/** The open folder's first page and the pages the user has turned to. */
export function useFolderPage(
  api: MailAPI,
  scope: MailScope,
  folder: MailFolder,
  source: {
    boxes: Mailbox[];
    label: MailLabelFilter | undefined;
    accountsRead: boolean;
    search: { query: string; pending: boolean };
    busy: boolean;
    revision: string | undefined;
  },
) {
  const { boxes, label, accountsRead, search, busy, revision } = source;
  const local = localMailQueries(api, scope);
  const page = useQuery({
    ...local.page(folder),
    enabled: (!label || accountsRead) && (!search.query || !search.pending),
    refetchInterval: busy ? 1500 : false,
  });
  // Previous search results are only shown. Paging starts from the new search's own results.
  const paging = useMailPages(
    api,
    scope,
    folder,
    boxes.map((box) => box.id),
    page.isPlaceholderData ? undefined : page.data?.items,
    busy,
    revision,
  );
  // The folder whose results are on screen. The list keeps its state until new results replace
  // them, instead of starting over on every keystroke.
  const [shownFolder, setShownFolder] = useState(folder);
  if (!page.isPlaceholderData && JSON.stringify(shownFolder) !== JSON.stringify(folder))
    setShownFolder(folder);
  const rows = page.isPlaceholderData ? page.data.items : paging.items;
  return { page, paging, shownFolder, rows };
}

/** The counts that mail navigation shows for the open folder. */
export function folderCounts(data: ReturnType<typeof useFolderPage>["page"]["data"]) {
  return {
    counts: { new: data?.newCount, unread: data?.unreadCount, drafts: data?.draftCount },
    unreadByMailbox: data?.unreadByMailbox,
  };
}

/** The open conversation's mailbox and messages. */
export function useSelectedThread(
  local: LocalMail,
  boxes: Mailbox[],
  selected: MailConversation | undefined,
) {
  const selectedBox = boxes.find((b) => b.id === selected?.mailboxId);
  const thread = useQuery({
    ...local.thread(selectedBox ? selected?.id : undefined),
    refetchInterval: selectedBox?.status === "syncing" ? 2500 : false,
  });
  return { selectedBox, thread };
}
