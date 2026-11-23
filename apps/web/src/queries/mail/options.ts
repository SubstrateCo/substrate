import type { MailAPI, MailFolder, MailScope, OlderMailQuery } from "@substrate/contracts/mail/ipc";

import { queryOptions, type QueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/queries/keys";

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
      queryFn: () => api.accounts(scope),
      retry: false,
    }),
    page: (query: MailFolder) =>
      queryOptions({
        queryKey: [...root, "list", scope, query],
        queryFn: () => api.list({ ...scope, ...query }),
        retry: false,
      }),
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
    body: (id: string | undefined, lastSync: number | null) =>
      queryOptions({
        queryKey: [...root, "body", scope, id, lastSync],
        enabled: !!id,
        queryFn: () => api.body({ ...scope, id: id! }),
        retry: false,
      }),
    thread: (id: string | undefined, lastSync: number | null) =>
      queryOptions({
        queryKey: [...root, "thread", scope, id, lastSync],
        enabled: !!id,
        queryFn: () => api.thread({ ...scope, id: id! }),
        retry: false,
      }),
  };
}
