import { conversationKey, type MailView } from "@substrate/contracts/mail";
import type { MailAPI, MailScope, MailLabelFilter } from "@substrate/contracts/mail/ipc";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { useMailChanges, useReaderSelection } from "./inbox-actions";
import {
  folderCounts,
  labelFilter,
  mailboxStatus,
  useFolderPage,
  useMailAccounts,
  useSelectedThread,
} from "./inbox-data";
import { InboxHeader, LabelFilterBar, SyncNotice } from "./inbox-header";
import { InboxWorkspaceContext, type InboxWorkspaceValue } from "./inbox-workspace-context";
import { InboxList } from "./list/inbox-list";
import { SelectableMessageList } from "./list/selectable-message-list";
import { mailboxColors } from "./mail-colors";
import { MailPagination } from "./mail-paging";
import { folderView } from "./mail-views";
import { MailboxDialogs } from "./mailboxes/mailbox-dialogs";
import { CompactMailboxPicker, MailboxSidebar, MobileViewPicker } from "./mailboxes/mailboxes";
import { Reader } from "./reader/reader";
import { ErrorState } from "@/components/feedback/error-state";
import { useStateDialog } from "@/components/feedback/use-state-dialog";
import { PageContent, PageLayout } from "@/components/layout/page-layout";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useSearchDebounce } from "@/hooks/use-search-debounce";
import { localMailQueries } from "@/queries/mail/options";

export function InboxWorkspace({ api, scope }: { api: MailAPI; scope: MailScope }) {
  const [account, setAccount] = useState<string | null>(null);
  const [view, setView] = useState<MailView>("inbox");
  const [allTags, setAllTags] = useState(true);
  const [label, setLabel] = useState<MailLabelFilter>();
  const [search, setSearch] = useState("");
  const field = useRef<HTMLInputElement>(null);
  const { selected, setSelected, focusList, closeReader } = useReaderSelection(field);
  const [listVisit, setListVisit] = useState(0);
  const dialog = useStateDialog<"connect" | "manage">(() =>
    document.getElementById("mailbox-switch")?.focus(),
  );
  const sidebar = useMediaQuery("(min-width: 768px)");
  const split = useMediaQuery("(min-width: 1024px)");
  const client = useQueryClient();
  const local = localMailQueries(api, scope);
  const { userId, organizationId } = scope;
  const { accounts, boxes, revision } = useMailAccounts(local);
  const { active, busy, problem } = mailboxStatus(boxes, account);
  const { selectedLabel, filter } = labelFilter(boxes, label);
  const searchState = useSearchDebounce(search.trim(), organizationId);
  const folder = { mailboxId: account, view, label: filter, search };
  const { page, paging, shownFolder, rows } = useFolderPage(api, scope, folder, {
    boxes,
    label,
    accountsRead: accounts.isSuccess,
    search: searchState,
    busy,
    revision,
  });
  const { selectedBox, thread } = useSelectedThread(local, boxes, selected);
  const sync = useMutation({
    mutationFn: (mailboxId: string | null) => api.sync({ ...scope, mailboxId }),
    onSuccess: () => {
      paging.reset();
      return client.invalidateQueries({ queryKey: local.root });
    },
  });
  const data = page.data;
  function navigate(next: MailView) {
    setLabel(undefined);
    setView(next);
    setSearch("");
    setSelected(undefined);
    paging.reset();
  }
  const { changeMessage, changeConversations, labelActions } = useMailChanges(api, scope, {
    label,
    resetPages: paging.reset,
    closeReader,
    onLabelHidden: () => navigate("inbox"),
  });
  const nav = {
    connected: boxes,
    colors: mailboxColors(boxes),
    scope: active,
    unified: !active && boxes.length > 1,
    onSelect: (box: typeof active) => {
      setLabel(undefined);
      setAccount(box?.id ?? null);
      paging.reset();
      setSelected(undefined);
    },
    onConnect: () => dialog.open("connect"),
    onManage: () => dialog.open("manage"),
  };
  const viewNav = {
    filter,
    onLabel: (value: MailLabelFilter) => {
      navigate("inbox");
      setLabel(value);
    },
    view,
    onView: navigate,
    ...folderCounts(data),
    onMailboxUnread: (box: (typeof boxes)[number]) => {
      setAccount(box.id);
      navigate("unread");
    },
  };
  // The actions close over the selection and label filter. Consumers call the latest ones
  // through a stable context value, so a new selection doesn't change the context.
  const latest = useRef({ changeMessage, labelActions, focusList, onManage: nav.onManage });
  useLayoutEffect(() => {
    latest.current = { changeMessage, labelActions, focusList, onManage: nav.onManage };
  });
  const workspace = useMemo<InboxWorkspaceValue>(
    () => ({
      api,
      scope,
      labelActions: {
        onLabelColor: (...args) => latest.current.labelActions.onLabelColor(...args),
        onLabelVisibility: (...args) => latest.current.labelActions.onLabelVisibility(...args),
      },
      readerActions: {
        onAction: (...args) => latest.current.changeMessage(...args),
        onManage: () => latest.current.onManage(),
        focusList: () => latest.current.focusList(),
      },
    }),
    [api, scope],
  );
  const current = folderView(selectedLabel, view);
  const syncing = busy || sync.isPending;
  const syncAccount = () => sync.mutate(account);
  // Failed authority checks must also hide cached account names, counts and the open reader.
  const unreadable = accounts.isError || page.isError || thread.isError;
  if (unreadable || paging.failed)
    return (
      <ErrorState
        title="Couldn’t read local mail"
        onRetry={() => {
          paging.reset();
          void client.invalidateQueries({ queryKey: local.root });
        }}
      />
    );
  return (
    <InboxWorkspaceContext value={workspace}>
      <PageLayout id="mail" aria-label="Inbox workspace" mobileView="content">
        {sidebar && !(selected && !split) && <MailboxSidebar {...nav} {...viewNav} />}
        <PageContent>
          <InboxHeader
            heading={
              sidebar
                ? { title: current.label, icon: <current.icon aria-hidden /> }
                : {
                    leading: <CompactMailboxPicker {...nav} />,
                    title: boxes.length ? (
                      <MobileViewPicker
                        {...viewNav}
                        {...nav}
                        onSync={syncAccount}
                        syncing={syncing}
                      />
                    ) : (
                      current.label
                    ),
                  }
            }
            current={current}
            tools={
              boxes.length
                ? {
                    syncing,
                    onSync: syncAccount,
                    allTags,
                    onToggleTags: () => setAllTags((value) => !value),
                    field,
                    search,
                    onSearch: (value) => {
                      setSearch(value);
                      setSelected(undefined);
                      paging.reset();
                    },
                  }
                : undefined
            }
          />
          <LabelFilterBar
            boxes={boxes}
            scope={active}
            unified={nav.unified}
            filter={filter}
            onLabel={viewNav.onLabel}
            onClear={() => navigate("inbox")}
          />
          <SyncNotice
            problem={problem}
            failed={sync.isError}
            account={account}
            onManage={nav.onManage}
            onSync={(mailboxId) => sync.mutate(mailboxId)}
          />
          <InboxList
            accountsPending={accounts.isPending}
            pagePending={page.isPending}
            loadingMore={busy || paging.pending}
            connected={boxes.length > 0}
            rows={rows}
            search={search}
            current={current}
            onConnect={nav.onConnect}
            onClearSearch={() => {
              setSearch("");
              paging.reset();
              field.current?.focus();
            }}
            renderList={(messages) => (
              <SelectableMessageList
                key={JSON.stringify([
                  userId,
                  organizationId,
                  shownFolder,
                  boxes.map((b) => b.id),
                  listVisit,
                ])}
                messages={messages}
                mailboxes={boxes}
                selected={selected ? conversationKey(selected) : null}
                unified={!account}
                onOpen={setSelected}
                onBeginSelection={() => setSelected(undefined)}
                onManage={nav.onManage}
                onChange={changeConversations}
                allTags={allTags}
              />
            )}
          />
          {!!boxes.length && !!data && (paging.index > 0 || !!rows?.length || paging.more) && (
            <MailPagination
              paging={paging}
              onTurn={() => {
                setSelected(undefined);
                setListVisit((v) => v + 1);
              }}
            />
          )}
        </PageContent>
        {selected && selectedBox && (
          <Reader
            key={conversationKey(selected)}
            message={selected}
            mailbox={selectedBox}
            messages={thread.data}
            active={!dialog.value}
            onClose={closeReader}
          />
        )}
      </PageLayout>
      <MailboxDialogs
        api={api}
        scope={scope}
        dialog={dialog}
        boxes={boxes}
        onConnected={(id) => {
          setAccount(id);
          navigate("inbox");
        }}
        onDisconnected={(mailboxId) => {
          if (account === mailboxId) setAccount(null);
          setSelected(undefined);
          paging.reset();
        }}
      />
    </InboxWorkspaceContext>
  );
}
