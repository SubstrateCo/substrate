import {
  conversationKey,
  filterLabels,
  type MailConversation,
  type MailMessageAction,
  type MailView,
} from "@substrate/contracts/mail";
import type { MailAPI, MailScope, MailLabelFilter } from "@substrate/contracts/mail/ipc";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useCallback, useEffect, useRef, useState } from "react";

import { ConnectMailbox } from "./connect-mailbox";
import type { LabelActions } from "./label-menu";
import { mailboxColors, labelName } from "./mail-colors";
import { MailPagination, useMailPages } from "./mail-paging";
import { views } from "./mail-views";
import { MailboxPicker, MailboxSidebar, MobileViewPicker } from "./mailboxes";
import { ManageMailboxes } from "./manage-mailboxes";
import { LabelDisplayToggle } from "./message-labels";
import { Reader } from "./reader";
import { SelectableMessageList } from "./selectable-message-list";
import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { useStateDialog } from "@/components/feedback/use-state-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { PageContent, PageLayout } from "@/components/layout/page-layout";
import { RowAction } from "@/components/layout/row-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useSearchDebounce } from "@/hooks/use-search-debounce";
import { queryKeys } from "@/queries/keys";
import { localMailQueries } from "@/queries/mail/options";
import { Mail, RefreshCw, Search, Tag } from "lucide-react";

export function InboxWorkspace({ api, scope }: { api: MailAPI; scope: MailScope }) {
  const [account, setAccount] = useState<string | null>(null);
  const [view, setView] = useState<MailView>("inbox");
  const [allTags, setAllTags] = useState(true);
  const [label, setLabel] = useState<MailLabelFilter>();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<MailConversation>();
  const [listVisit, setListVisit] = useState(0);
  const field = useRef<HTMLInputElement>(null);
  const dialog = useStateDialog<"connect" | "manage">(() =>
    document.getElementById("mailbox-switch")?.focus(),
  );
  const sidebar = useMediaQuery("(min-width: 768px)");
  const split = useMediaQuery("(min-width: 1024px)");
  const client = useQueryClient();
  const local = localMailQueries(api, scope);
  const { userId, organizationId } = scope;
  const readPicture = useCallback(
    (id: string, source: string) => api.picture({ userId, organizationId, id, source }),
    [api, userId, organizationId],
  );
  const accounts = useQuery({
    ...local.accounts,
    refetchInterval: (q) => (q.state.data?.some((b) => b.status === "syncing") ? 1500 : false),
  });
  const boxes = accounts.data ?? [];
  const revision = accounts.data?.map((b) => `${b.id}:${b.lastSync}:${b.status}`).join(",");
  const previousRevision = useRef<string>(undefined);
  useEffect(() => {
    if (revision === undefined) return;
    if (previousRevision.current !== undefined && previousRevision.current !== revision)
      for (const kind of ["list", "thread", "body"])
        void client.invalidateQueries({
          queryKey: [...queryKeys.mail(userId, organizationId), kind],
        });
    previousRevision.current = revision;
  }, [client, organizationId, revision, userId]);
  const active = boxes.find((b) => b.id === account) ?? null;
  const selectedLabel = boxes
    .find((b) => b.id === label?.mailboxId)
    ?.labels.find((l) => l.id === label?.id);
  const filter = selectedLabel ? label : undefined;
  const searchState = useSearchDebounce(search.trim(), organizationId);
  const busy = boxes.some((b) => (!account || b.id === account) && b.status === "syncing");
  const problem = boxes.find(
    (b) => (!account || b.id === account) && (b.status === "retry" || b.status === "reconnect"),
  );
  const folder = { mailboxId: account, view, label: filter, search };
  const page = useQuery({
    ...local.page(folder),
    enabled: (!label || accounts.isSuccess) && (!searchState.query || !searchState.pending),
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
  const selectedBox = boxes.find((b) => b.id === selected?.mailboxId);
  const thread = useQuery({
    ...local.thread(selectedBox ? selected?.id : undefined),
    refetchInterval: selectedBox?.status === "syncing" ? 2500 : false,
  });
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
  async function changeMessage(id: string, action: MailMessageAction) {
    const result = await api[action]({ ...scope, id });
    if (result === "updated" || result === "missing") paging.reset();
    await client.invalidateQueries({ queryKey: local.root });
    if (result === "missing" || (result === "updated" && action === "trashMessage")) closeReader();
    return result;
  }
  async function changeConversations(ids: string[], action: MailMessageAction) {
    const results = await api.changeConversations({ ...scope, ids, action });
    if (results.some((r) => r.result === "updated" || r.result === "missing")) paging.reset();
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
        if (!box || !filterLabels(box).some((l) => l.id === label.id)) navigate("inbox");
      }
    },
  };
  const nav = {
    connected: boxes,
    colors: mailboxColors(boxes),
    scope: active,
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
    counts: { new: data?.newCount, unread: data?.unreadCount, drafts: data?.draftCount },
    unreadByMailbox: data?.unreadByMailbox,
    onMailboxUnread: (box: (typeof boxes)[number]) => {
      setAccount(box.id);
      navigate("unread");
    },
  };
  const current = selectedLabel
    ? {
        label: labelName(selectedLabel),
        icon: Tag,
        empty: "No messages with this label",
        hint: "Messages with this label appear here.",
      }
    : views[view];
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
  function list() {
    if (accounts.isPending || (boxes.length && page.isPending))
      return <LoadingState label="Reading local mail…" />;
    if (!boxes.length)
      return (
        <ContentNotice
          icon={Mail}
          title="Connect your first mailbox"
          description="Read your Gmail inbox on this device."
          action={<Button onClick={nav.onConnect}>Connect Gmail</Button>}
        />
      );
    if (rows?.length)
      return (
        <SelectableMessageList
          key={JSON.stringify([
            userId,
            organizationId,
            shownFolder,
            boxes.map((b) => b.id),
            listVisit,
          ])}
          messages={rows}
          mailboxes={boxes}
          colors={nav.colors}
          selected={selected ? conversationKey(selected) : null}
          unified={!account}
          onOpen={setSelected}
          onBeginSelection={() => setSelected(undefined)}
          onManage={nav.onManage}
          onChange={changeConversations}
          allTags={allTags}
        />
      );
    if (search)
      return (
        <ContentNotice
          icon={Search}
          title="No matching messages"
          description={`No match in ${current.label}.`}
          action={
            <Button
              onClick={() => {
                setSearch("");
                paging.reset();
                field.current?.focus();
              }}
            >
              Clear search
            </Button>
          }
        />
      );
    if (busy || paging.pending) return <LoadingState label="Loading messages…" />;
    return <ContentNotice icon={current.icon} title={current.empty} description={current.hint} />;
  }
  return (
    <>
      <PageLayout id="mail" aria-label="Inbox workspace" mobileView="content">
        {sidebar && !(selected && !split) && (
          <MailboxSidebar {...nav} {...viewNav} labelActions={labelActions} />
        )}
        <PageContent>
          <PageHeader
            variant="pane"
            className="@container"
            leading={!sidebar && <MailboxPicker {...nav} compact />}
            title={
              sidebar || !boxes.length ? (
                current.label
              ) : (
                <MobileViewPicker
                  {...viewNav}
                  {...nav}
                  onSync={() => sync.mutate(account)}
                  syncing={busy || sync.isPending}
                />
              )
            }
            icon={sidebar ? <current.icon aria-hidden /> : undefined}
            actions={
              boxes.length > 0 && (
                <>
                  <LabelDisplayToggle
                    expanded={allTags}
                    onToggle={() => setAllTags((value) => !value)}
                  />
                  <span className="max-[384px]:hidden">
                    <RowAction
                      label="Sync mail"
                      disabled={busy || sync.isPending}
                      onClick={() => sync.mutate(account)}
                    >
                      <RefreshCw aria-hidden />
                    </RowAction>
                  </span>
                </>
              )
            }
          >
            {boxes.length > 0 && (
              <div className="max-w-xs min-w-0">
                <Input
                  ref={field}
                  type="search"
                  maxLength={500}
                  aria-label="Search messages"
                  placeholder={`Search ${current.label.toLowerCase()}…`}
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setSelected(undefined);
                    paging.reset();
                  }}
                />
              </div>
            )}
          </PageHeader>
          {(problem || sync.isError) && (
            <div
              role="status"
              className="flex items-center gap-2 border-b px-4 py-1 text-xs text-muted-foreground"
            >
              {problem?.status === "reconnect"
                ? `${problem.address} needs to reconnect.`
                : "Sync paused. Cached mail is available."}
              <Button
                size="xs"
                variant="link"
                onClick={() =>
                  problem?.status === "reconnect"
                    ? nav.onManage()
                    : sync.mutate(problem?.id ?? account)
                }
              >
                {problem?.status === "reconnect" ? "Manage mailboxes" : "Retry sync"}
              </Button>
            </div>
          )}
          {list()}
          {!!boxes.length && !!data && (
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
            bodyOptions={local.body}
            readPicture={readPicture}
            active={!dialog.value}
            actions={{ onAction: changeMessage, onManage: nav.onManage, focusList }}
            onClose={closeReader}
          />
        )}
      </PageLayout>
      {dialog.value === "connect" && (
        <ConnectMailbox
          hasMailboxes={boxes.length > 0}
          onClose={dialog.close}
          onRestoreFocus={dialog.restoreFocus}
          onConnect={async (nickname, chooseClient) => {
            const id = await api.connectGmail({ ...scope, nickname, chooseClient });
            if (id === null) return false;
            setAccount(id);
            navigate("inbox");
            await client.invalidateQueries({ queryKey: local.root });
            return true;
          }}
        />
      )}
      {dialog.value === "manage" && (
        <ManageMailboxes
          boxes={boxes}
          onClose={dialog.close}
          onRestoreFocus={dialog.restoreFocus}
          onRename={async (mailboxId, nickname) => {
            await api.rename({ ...scope, mailboxId, nickname });
            await client.invalidateQueries({ queryKey: local.accounts.queryKey });
          }}
          {...labelActions}
          onReconnect={async (mailboxId, chooseClient) => {
            const result = await api.reconnectGmail({ ...scope, mailboxId, chooseClient });
            if (result === "connected") await client.invalidateQueries({ queryKey: local.root });
            return result;
          }}
          onDisconnect={async (mailboxId) => {
            await api.disconnect({ ...scope, mailboxId });
            if (account === mailboxId) setAccount(null);
            setSelected(undefined);
            paging.reset();
            // Evict old bodies plus unified lists that can still contain this mailbox's rows.
            await client.cancelQueries({ queryKey: local.root });
            await client.resetQueries({ queryKey: local.root });
          }}
        />
      )}
    </>
  );
}
