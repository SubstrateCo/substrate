import { QueryClient, QueryObserver } from "@tanstack/react-query";

import { ApiError, NetworkError } from "../api/result";
import { clearPrivateQueries, watchAccessFailures } from "./privacy";
import { expect, test } from "bun:test";

test("account exit clears private data from mounted observers, not only the query map", () => {
  const client = new QueryClient();
  const key = ["account", "old", "workspace", "team", "record"];
  client.setQueryData(key, { title: "Private record" });
  const observer = new QueryObserver(client, { queryKey: key, enabled: false });
  const unsubscribe = observer.subscribe(() => {});
  clearPrivateQueries(client);
  expect(observer.getCurrentResult().data).toBeUndefined();
  expect(client.getQueryCache().getAll()).toHaveLength(0);
  unsubscribe();
});

test("a denied refresh removes loaded private data while a network outage does not", () => {
  const client = new QueryClient();
  const stop = watchAccessFailures(client);
  const key = ["account", "one", "workspace", "team", "record"];
  client.setQueryData(key, { title: "Private record" });
  const query = client.getQueryCache().find({ queryKey: key });
  if (!query) throw new Error("Expected private query.");
  query.setState({ status: "error", error: new NetworkError(new Error("offline")) });
  expect(client.getQueryData(key)).toEqual({ title: "Private record" });
  query.setState({ status: "error", error: new ApiError("FORBIDDEN", "No access.", 403) });
  expect(client.getQueryData(key)).toBeUndefined();
  stop();
  client.clear();
});
