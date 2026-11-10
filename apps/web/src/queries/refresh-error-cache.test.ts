import { QueryClient } from "@tanstack/react-query";

import { createRefreshErrorCache } from "./refresh-error-cache";
import { afterAll, afterEach, expect, spyOn, test } from "bun:test";
import { toast } from "sonner";

const notify = spyOn(toast, "error").mockReturnValue("refresh-toast");
const dismiss = spyOn(toast, "dismiss").mockReturnValue("refresh-toast");

afterAll(() => {
  notify.mockRestore();
  dismiss.mockRestore();
});

afterEach(() => {
  notify.mockClear();
  dismiss.mockClear();
});

test("refresh feedback is opt-in, requires cached data, and excludes access failures", async () => {
  const client = new QueryClient({ queryCache: createRefreshErrorCache() });
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
    expect(notify).not.toHaveBeenCalled();
  } finally {
    client.clear();
  }
});

test("poll failures notify once per outage and recovery resets feedback", async () => {
  const client = new QueryClient({ queryCache: createRefreshErrorCache() });
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
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0]?.[0]).toBe("Couldn’t refresh project");
    expect(client.getQueryData(options.queryKey)).toEqual(["loaded project"]);
    expect(notify.mock.calls[0]?.[1]?.action).toMatchObject({ label: "Retry" });

    unavailable = false;
    await client.query(options);
    expect(client.getQueryData(options.queryKey)).toEqual(["updated project"]);
    expect(dismiss).toHaveBeenCalledWith(JSON.stringify(options.queryKey));

    unavailable = true;
    const failure = await client.query(options).catch((error: Error) => error);
    expect(failure).toBeInstanceOf(Error);
    expect(notify).toHaveBeenCalledTimes(2);
  } finally {
    client.clear();
  }
});

test("access loss dismisses feedback that says cached content is available", async () => {
  const client = new QueryClient({ queryCache: createRefreshErrorCache() });
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
    expect(notify).toHaveBeenCalledTimes(1);
    expect(dismiss).toHaveBeenCalledWith(JSON.stringify(queryKey));
  } finally {
    client.clear();
  }
});
