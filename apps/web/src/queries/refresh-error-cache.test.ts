import { QueryClient } from "@tanstack/react-query";

import { createRefreshErrorCache } from "./refresh-error-cache";
import { expect, test } from "bun:test";

type Notifier = NonNullable<Parameters<typeof createRefreshErrorCache>[0]>;

function recordingNotifier() {
  const shown: Parameters<Notifier["error"]>[] = [];
  const dismissed: Parameters<Notifier["dismiss"]>[0][] = [];
  const notifier: Notifier = {
    error: (...args) => {
      shown.push(args);
      return "refresh-toast";
    },
    dismiss: (id) => {
      dismissed.push(id);
      return "refresh-toast";
    },
  };
  return { notifier, shown, dismissed };
}

test("refresh feedback is opt-in, requires cached data, and excludes access failures", async () => {
  const { notifier, shown } = recordingNotifier();
  const client = new QueryClient({ queryCache: createRefreshErrorCache(notifier) });
  try {
    for (const scenario of ["initial", "unmarked", "access"] as const) {
      const queryKey = [scenario];
      if (scenario !== "initial") client.setQueryData(queryKey, ["private content"]);
      const failure = await client
        .query({
          queryKey,
          meta: scenario === "unmarked" ? undefined : { refreshError: "Couldn’t refresh project" },
          queryFn: () =>
            Promise.reject(
              scenario === "access"
                ? Object.assign(new Error("Forbidden"), { status: 403 })
                : new Error("Internal connection details"),
            ),
          retry: false,
        })
        .catch((error: Error) => error);
      expect(failure).toBeInstanceOf(Error);
    }
    expect(shown).toEqual([]);
  } finally {
    client.clear();
  }
});

test("poll failures notify once per outage and recovery resets feedback", async () => {
  const { notifier, shown, dismissed } = recordingNotifier();
  const client = new QueryClient({ queryCache: createRefreshErrorCache(notifier) });
  let unavailable = true;
  const read = async () => {
    if (unavailable) throw new Error("Internal connection details");
    return ["updated project"];
  };
  const options = {
    queryKey: ["project-refresh"],
    meta: { refreshError: "Couldn’t refresh project" },
    queryFn: () => read(),
    retry: false,
  };
  client.setQueryData(options.queryKey, ["loaded project"]);
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const failure = await client.query(options).catch((error: Error) => error);
      expect(failure).toBeInstanceOf(Error);
    }
    expect(shown).toHaveLength(1);
    expect(shown[0]?.[0]).toBe("Couldn’t refresh project");
    expect(shown[0]?.[1]?.action).toMatchObject({ label: "Retry" });

    unavailable = false;
    await client.query(options);
    expect(dismissed).toEqual([JSON.stringify(options.queryKey)]);

    unavailable = true;
    const failure = await client.query(options).catch((error: Error) => error);
    expect(failure).toBeInstanceOf(Error);
    expect(shown).toHaveLength(2);
  } finally {
    client.clear();
  }
});

test("access loss dismisses feedback that says cached content is available", async () => {
  const { notifier, shown, dismissed } = recordingNotifier();
  const client = new QueryClient({ queryCache: createRefreshErrorCache(notifier) });
  const queryKey = ["project-access-loss"];
  client.setQueryData(queryKey, ["private project"]);
  try {
    for (const error of [
      new Error("Offline"),
      Object.assign(new Error("Forbidden"), { status: 403 }),
    ]) {
      await client
        .query({
          queryKey,
          meta: { refreshError: "Couldn’t refresh project" },
          queryFn: () => Promise.reject(error),
          retry: false,
        })
        .catch(() => {});
    }
    expect(shown).toHaveLength(1);
    expect(dismissed).toEqual([JSON.stringify(queryKey)]);
  } finally {
    client.clear();
  }
});
