import { conversationKey, mailPageSize, type MailConversation } from "@substrate/contracts/mail";
import type {
  MailAPI,
  MailFolder,
  MailPageSource,
  MailScope,
  OlderMailQuery,
  OlderMailPage,
} from "@substrate/contracts/mail/ipc";

import { useMutation, useQuery } from "@tanstack/react-query";

import { useEffect, useRef, useState, type RefObject } from "react";

import { RowAction } from "@/components/layout/row-actions";
import { localMailQueries } from "@/queries/mail/options";
import { ChevronLeft, ChevronRight } from "lucide-react";

type History = {
  key: string;
  pages: MailConversation[][];
  index: number;
  before: number;
  sources: MailPageSource[];
  more: boolean;
  pending?: boolean;
  failed?: boolean;
  issue?: OlderMailPage["issue"];
};

type LocalMail = ReturnType<typeof localMailQueries>;
type Request = RefObject<symbol | undefined>;
type OpeningPage = OlderMailPage & { before: number };

/** The checked opening page, when it holds the cached rows and has no provider issue. */
function matchingOpening(
  checked: { isError: boolean; data: OpeningPage | undefined },
  first: MailConversation[],
) {
  const opening = checked.data;
  if (checked.isError || !opening || opening.issue) return;
  const samePage =
    opening.items.length === first.length && opening.items.every((m, i) => m.id === first[i]?.id);
  return samePage ? opening : undefined;
}

function openingHistory(key: string, first: MailConversation[], opening: OpeningPage): History {
  return {
    key,
    pages: [first],
    index: 0,
    before: opening.before,
    more: opening.hasMore,
    sources: opening.sources,
    issue: opening.issue,
  };
}

/** The pages kept before an older page and the read that loads it. */
function olderPageRead(current: History, folder: MailFolder) {
  // An offline partial page stays at its original page number when retried.
  const shown = current.pages[current.index]!.length;
  const retryPage = !shown || (shown < mailPageSize && !!current.issue);
  const previous = retryPage ? current.pages.slice(0, -1) : current.pages;
  // Complete pages hold every cached conversation newer than their last one. A page kept
  // despite a provider issue may not, so the next read walks from `before` again.
  const complete = retryPage || !current.issue;
  const query: OlderMailQuery = {
    ...folder,
    before: current.before,
    seen: previous.flat().map(conversationKey),
    shownThrough: complete ? previous.at(-1)?.at(-1)?.timestamp : undefined,
    sources: current.sources,
  };
  return { previous, query };
}

/** The opening page: cached rows, checked against the provider when they may have gaps. */
function useFirstPage(
  local: LocalMail,
  folder: MailFolder,
  mailboxIds: string[],
  cached: MailConversation[] | undefined,
  syncing: boolean,
  revision: string | undefined,
  browsing: boolean,
  requestRef: Request,
) {
  // Paint local rows immediately. Even 50 cached rows can have gaps (for example,
  // after visiting another folder). Verify the opening folder page from the newest ID.
  // Search stays local until the user explicitly requests more results.
  const checkFirst = cached !== undefined && !folder.search.trim();
  const fill = useQuery({
    ...local.firstPage(folder, revision),
    enabled: !browsing && checkFirst && !syncing && mailboxIds.length > 0,
  });
  const first = cached ?? fill.data?.items;
  const filling =
    !browsing && (fill.isFetching || (checkFirst && syncing && cached.length < mailPageSize));
  // An explicit Next runs the first provider search. Keep the page number if it
  // fills any gaps; advance in the same click if the cached page was complete.
  async function check(ticket: symbol, shown: MailConversation[]) {
    requestRef.current = ticket;
    const checked = await fill.refetch();
    if (requestRef.current !== ticket) return;
    requestRef.current = undefined;
    return matchingOpening(checked, shown);
  }
  return { fill, first, filling, check };
}

/** Visited pages for the current navigation key, and the reads that add older ones. */
function usePageHistory(local: LocalMail, folder: MailFolder, key: string, requestRef: Request) {
  const [history, setHistory] = useState<History>();
  const active = history?.key === key ? history : undefined;
  const load = useMutation({
    mutationFn: (query: OlderMailQuery, { client }) => local.readPage(query, client),
    retry: false,
  });
  function turn(current: History, ticket: symbol) {
    if (current.index + 1 < current.pages.length) {
      setHistory({ ...current, index: current.index + 1 });
      return;
    }
    if (!current.more) return;
    requestRef.current = ticket;
    const { previous, query } = olderPageRead(current, folder);
    setHistory({ ...current, pending: true, issue: undefined });
    load.mutate(query, {
      onSuccess: (result) => {
        if (requestRef.current !== ticket) return;
        const pages =
          result.items.length || !previous.length ? [...previous, result.items] : previous;
        setHistory({
          ...current,
          sources: result.sources,
          more: result.hasMore,
          pending: false,
          pages,
          index: pages.length - 1,
          issue: result.issue,
        });
      },
      onError: () => {
        if (requestRef.current === ticket) setHistory({ ...current, pending: false, failed: true });
      },
      onSettled: () => {
        if (requestRef.current === ticket) requestRef.current = undefined;
      },
    });
  }
  return {
    active,
    turn,
    previous: () => {
      const index = active?.index ?? 0;
      if (active && index > 0 && !active.pending) setHistory({ ...active, index: index - 1 });
    },
    reset: () => {
      requestRef.current = undefined;
      setHistory(undefined);
    },
  };
}

/** The page on screen and its paging status. */
function shownPage(active: History | undefined, opening: ReturnType<typeof useFirstPage>) {
  const { fill, first, filling } = opening;
  const index = active?.index ?? 0;
  return {
    items: active?.pages[index] ?? first,
    index,
    pending: !!active?.pending || filling,
    failed: !!active?.failed || fill.isError,
    issue: index === (active?.pages.length ?? 1) - 1 ? (active ?? fill.data)?.issue : undefined,
    more: active ? index + 1 < active.pages.length || active.more : (fill.data?.hasMore ?? true),
  };
}

/** Freeze visited pages so a new arrival or a Gmail retry cannot change what Previous
 * means. The verified session and connected mailbox set are part of the navigation key. */
export function useMailPages(
  api: MailAPI,
  scope: MailScope,
  folder: MailFolder,
  mailboxIds: string[],
  cached: MailConversation[] | undefined,
  syncing: boolean,
  revision: string | undefined,
) {
  const key = JSON.stringify([
    scope.userId,
    scope.organizationId,
    folder,
    mailboxIds,
    folder.view === "unread" ? revision : null,
  ]);
  const local = localMailQueries(api, scope);
  const request = useRef<symbol>(undefined);
  const history = usePageHistory(local, folder, key, request);
  const { active } = history;
  const opening = useFirstPage(
    local,
    folder,
    mailboxIds,
    cached,
    syncing,
    revision,
    !!active,
    request,
  );
  useEffect(() => {
    return () => {
      request.current = undefined;
    };
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- A new navigation key drops the request started for the old one.
  }, [key]);

  async function next() {
    const { fill, first, filling } = opening;
    if (!first || filling) return;
    if (active?.pending || request.current) return;
    const ticket = Symbol();
    let current = active;
    if (!current) {
      const checked = fill.data ?? (await opening.check(ticket, first));
      if (!checked) return;
      current = openingHistory(key, first, checked);
    }
    history.turn(current, ticket);
  }
  return {
    ...shownPage(active, opening),
    next,
    previous: history.previous,
    reset: history.reset,
  };
}

export function MailPagination({
  paging,
  onTurn,
}: {
  paging: ReturnType<typeof useMailPages>;
  onTurn: () => void;
}) {
  const { index, pending, more, issue } = paging;
  function status() {
    if (pending) return "Loading older mail…";
    if (issue === "reconnect") return "Reconnect Gmail to load more mail.";
    if (issue === "unavailable") return "Couldn’t load more mail. Choose Next to retry.";
    return more ? "" : "No more messages.";
  }
  return (
    <nav
      aria-label="Message pages"
      className="flex items-center justify-end gap-2 border-t px-3 py-1 text-xs text-muted-foreground"
    >
      <span role="status" className="mr-auto">
        {status()}
      </span>
      <RowAction
        label="Previous page"
        disabled={!index || pending}
        onClick={() => {
          onTurn();
          paging.previous();
        }}
      >
        <ChevronLeft aria-hidden />
      </RowAction>
      <span aria-current="page">Page {index + 1}</span>
      <RowAction
        label="Next page"
        disabled={pending || !more}
        onClick={() => {
          onTurn();
          void paging.next();
        }}
      >
        <ChevronRight aria-hidden />
      </RowAction>
    </nav>
  );
}
