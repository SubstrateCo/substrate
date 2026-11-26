import type { QueryClient } from "@tanstack/react-query";

import { ApiError } from "../api/result";

/** Observers must lose their old data too, not only the cache's map entry. */
export function clearPrivateQueries(client: QueryClient) {
  void client.cancelQueries();
  for (const query of client.getQueryCache().getAll())
    query.setState({ data: undefined, dataUpdatedAt: 0 });
  client.clear();
}

export function watchAccessFailures(client: QueryClient) {
  return client.getQueryCache().subscribe((event) => {
    if (event.type !== "updated") return;
    const { query } = event;
    const { error, data } = query.state;
    if (
      data !== undefined &&
      error instanceof ApiError &&
      ["UNAUTHENTICATED", "FORBIDDEN", "NOT_FOUND", "WORKSPACE_CHANGED", "APP_DISABLED"].includes(
        error.code,
      )
    )
      query.setState({ data: undefined, dataUpdatedAt: 0 });
  });
}
