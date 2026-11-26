import type { Mailbox } from "@substrate/contracts/mail";
import type { MailAPI, MailFolder, MailScope, OlderMailQuery } from "@substrate/contracts/mail/ipc";

import { hashKey, queryOptions, skipToken, type QueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/queries/keys";

/** The mailboxes' sync state. It changes when a sync finishes or a mailbox changes status. */
export function mailRevision(boxes: Mailbox[]) {
  return boxes.map((b) => `${b.id}:${b.lastSync}:${b.status}`).join(",");
}

export function localMailQueries(api: MailAPI, scope: MailScope) {
  const root = queryKeys.mail(scope.userId, scope.organizationId);
  async function readPage(query: OlderMailQuery, client: QueryClient) {
    const page = await api.nextPage({ ...scope, ...query });
    // New replies change an open thread as well as its row and badge. Gmail can
    // also mark an empty mailbox for reconnection without returning any items.
    if (page.items.length || page.issue === "reconnect") {
      const affected = page.items.length ? ["accounts", "list", "thread"] : ["accounts"];
      await Promise.all(
        affected.map((kind) => client.invalidateQueries({ queryKey: [...root, kind] })),
      );
    }
    return page;
  }
  return {
    root,
    readPage,
    accounts: queryOptions({
      queryKey: [...root, "accounts", scope],
      // A new sync revision reads lists, threads and bodies again.
      queryFn: async ({ client, queryKey }) => {
        const previous = client.getQueryData<Mailbox[]>(queryKey);
        const boxes = await api.accounts(scope);
        if (previous && mailRevision(previous) !== mailRevision(boxes))
          for (const kind of ["list", "thread", "body"])
            void client.invalidateQueries({ queryKey: [...root, kind] });
        return boxes;
      },
      retry: false,
    }),
    page: (query: MailFolder) => {
      // The search comes last, so one folder's searches share every other part of the key.
      const queryKey = [...root, "list", scope, { ...query, search: "" }, query.search];
      const folder = hashKey(queryKey.slice(0, -1));
      return queryOptions({
        queryKey,
        queryFn: () => api.list({ ...scope, ...query }),
        // A new search in the same folder keeps the previous results on screen until its own
        // arrive. Another folder, mailbox or label starts from its own loading state.
        placeholderData: (previous, previousQuery) =>
          previousQuery && hashKey(previousQuery.queryKey.slice(0, -1)) === folder
            ? previous
            : undefined,
        retry: false,
      });
    },
    firstPage: (folder: MailFolder, revision: string | undefined) =>
      queryOptions({
        queryKey: [...root, "first-page", scope, folder, revision],
        queryFn: async ({ client }) => {
          const before = Date.now();
          const page = await readPage({ ...folder, before, seen: [], sources: [] }, client);
          return { ...page, before };
        },
        staleTime: Infinity,
        retry: false,
      }),
    // A sync invalidates bodies and threads instead of changing their keys, so the open reader
    // keeps its content while it reads again.
    body: (id: string | undefined) =>
      queryOptions({
        queryKey: [...root, "body", scope, id],
        queryFn: id ? () => api.body({ ...scope, id }) : skipToken,
        retry: false,
      }),
    thread: (id: string | undefined) =>
      queryOptions({
        queryKey: [...root, "thread", scope, id],
        queryFn: id ? () => api.thread({ ...scope, id }) : skipToken,
        retry: false,
      }),
  };
}
