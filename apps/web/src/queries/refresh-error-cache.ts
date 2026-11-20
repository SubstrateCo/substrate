import { QueryCache } from "@tanstack/react-query";

import { isAccessFailure } from "@/api/access-failure";
import { toast } from "sonner";

interface QueryMeta extends Record<string, string | undefined> {
  refreshError?: string;
}

declare module "@tanstack/react-query" {
  interface Register {
    queryMeta: QueryMeta;
  }
}

export function createRefreshErrorCache(notifier: Pick<typeof toast, "error" | "dismiss"> = toast) {
  const notified = new WeakSet<object>();
  return new QueryCache({
    onError: (error, query) => {
      const message = query.meta?.refreshError;
      if (!message || query.state.data === undefined) return;
      if (isAccessFailure(error)) {
        if (notified.delete(query)) notifier.dismiss(query.queryHash);
        return;
      }
      if (notified.has(query)) return;
      notified.add(query);
      notifier.error(message, {
        id: query.queryHash,
        description: "Your loaded content is still available.",
        action: {
          label: "Retry",
          onClick: () => {
            void query.fetch().catch(() => {});
          },
        },
      });
    },
    onSuccess: (_, query) => {
      if (!notified.delete(query)) return;
      notifier.dismiss(query.queryHash);
    },
  });
}
