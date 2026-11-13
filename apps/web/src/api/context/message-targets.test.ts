import { QueryClient } from "@tanstack/react-query";

import { ApiError } from "../result";
import { messageTargetOptions } from "@/queries/context/links";
import { afterEach, expect, spyOn, test } from "bun:test";
import { z } from "zod";

let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">> | undefined;
afterEach(() => {
  fetchSpy?.mockRestore();
});

const requestBody = z.object({
  organizationId: z.string(),
  targets: z.array(z.object({ conversationId: z.string(), messageId: z.string() })),
});
type Batch = z.infer<typeof requestBody>;

const view = (conversationId: string, id: string) => ({ id, conversationId, body: id });

// Fakes the server, which leaves out the targets the viewer can't open, and records each batch.
const fakeServer = (hidden: string[] = [], fail = false) => {
  const requests: Batch[] = [];
  fetchSpy?.mockRestore();
  fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = requestBody.parse(await new Response(init?.body).json());
        requests.push(body);
        if (fail)
          return Response.json(
            { success: false, error: { code: "INTERNAL_ERROR", message: "Down." } },
            { status: 500 },
          );
        return Response.json({
          success: true,
          data: body.targets
            .filter((target) => !hidden.includes(target.messageId))
            .map(({ conversationId, messageId }) => ({
              message: view(conversationId, messageId),
              root: view(conversationId, messageId),
            })),
        });
      },
      { preconnect: globalThis.fetch.preconnect },
    ),
  );
  return requests;
};

const load = (client: QueryClient, organizationId: string, conversationId: string, id: string) =>
  client.query(messageTargetOptions(organizationId, conversationId, id));

const reason = (result: PromiseSettledResult<unknown> | undefined) =>
  result?.status === "rejected" ? result.reason : undefined;

test("concurrent message targets share one request per organization and keep their own keys", async () => {
  const requests = fakeServer(["hidden"]);
  const client = new QueryClient();
  const results = await Promise.allSettled([
    load(client, "org", "c1", "a"),
    load(client, "org", "c2", "b"),
    load(client, "org", "c1", "hidden"),
    load(client, "other", "c3", "c"),
  ]);
  expect(requests).toEqual([
    {
      organizationId: "org",
      targets: [
        { conversationId: "c1", messageId: "a" },
        { conversationId: "c2", messageId: "b" },
        { conversationId: "c1", messageId: "hidden" },
      ],
    },
    { organizationId: "other", targets: [{ conversationId: "c3", messageId: "c" }] },
  ]);
  expect(results.map((result) => result.status)).toEqual([
    "fulfilled",
    "fulfilled",
    "rejected",
    "fulfilled",
  ]);
  expect(client.getQueryData(messageTargetOptions("org", "c2", "b").queryKey)).toMatchObject({
    message: { id: "b", conversationId: "c2" },
  });
  // A target the batch leaves out fails like the single read's access denial.
  const denied = reason(results[2]);
  expect(denied).toBeInstanceOf(ApiError);
  expect(denied).toMatchObject({ code: "NOT_FOUND", status: 404 });
  // Later reads start a new batch.
  await load(client, "org", "c1", "d");
  expect(requests).toHaveLength(3);
});

test("more than fifty targets split into server-sized batches; a failed batch fails its targets", async () => {
  const requests = fakeServer();
  const client = new QueryClient();
  const ids = Array.from({ length: 51 }, (_, index) => `m${index}`);
  await Promise.all(ids.map((id) => load(client, "org", "c", id)));
  expect(requests.map((request) => request.targets.length)).toEqual([50, 1]);
  fakeServer([], true);
  const failed = await Promise.allSettled([
    load(client, "org", "c", "x"),
    load(client, "org", "c", "y"),
  ]);
  expect(failed.map((result) => result.status)).toEqual(["rejected", "rejected"]);
  expect(reason(failed[0])).toMatchObject({ code: "INTERNAL_ERROR" });
});
