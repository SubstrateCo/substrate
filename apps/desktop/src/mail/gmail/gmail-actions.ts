import { mailFlag, type MailMessageAction } from "@substrate/contracts/mail";

import { gmailMessageState } from "./gmail-labels.ts";
import { ReconnectRequired } from "../provider.ts";
import { z } from "zod";

export class WritePermissionRequired extends Error {}
export type GmailRequest = (url: URL, init: RequestInit) => Promise<Response>;
export const gmailBase = "https://gmail.googleapis.com/gmail/v1/users/me/";

/** A POST is sent once. If the response is lost, read back the target; never replay blind. */
export async function changeGmailLabels(
  action: MailMessageAction,
  target: { kind: "messages" | "threads"; id: string },
  token: () => Promise<string>,
  signal: AbortSignal,
  check: () => Promise<void>,
  request: GmailRequest,
) {
  const trash = action === "trashMessage";
  const changeLabels =
    action === "markUnread" ? { addLabelIds: ["UNREAD"] } : { removeLabelIds: ["UNREAD"] };
  const { kind, id } = target;
  const resource = `${kind}/${encodeURIComponent(id)}`;
  const call = async (write: boolean) => {
    const access = await token();
    await check();
    signal.throwIfAborted();
    const url = new URL(write ? `${resource}/${trash ? "trash" : "modify"}` : resource, gmailBase);
    url.searchParams.set("fields", kind === "threads" ? "id,messages(id,labelIds)" : "id,labelIds");
    if (!write) url.searchParams.set("format", "minimal");
    return request(url, {
      method: write ? "POST" : "GET",
      headers: {
        authorization: `Bearer ${access}`,
        ...(write && !trash && { "content-type": "application/json" }),
      },
      body: write && !trash ? JSON.stringify(changeLabels) : undefined,
      redirect: "error",
      signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
    });
  };
  async function parse(response: Response) {
    if (response.status === 404) return null;
    if (response.status === 401) throw new ReconnectRequired("Reconnect Gmail.");
    if (response.status === 403) {
      const data = z
        .object({
          error: z.object({
            errors: z.array(z.object({ reason: z.string() })).optional(),
            details: z.array(z.object({ reason: z.string().optional() })).optional(),
          }),
        })
        .safeParse(await response.json().catch(() => null)).data?.error;
      if (
        data?.errors?.some((e) => e.reason === "insufficientPermissions") ||
        data?.details?.some((e) => e.reason === "ACCESS_TOKEN_SCOPE_INSUFFICIENT")
      )
        throw new WritePermissionRequired("Reconnect to enable Gmail actions.");
    }
    if (!response.ok) throw new Error("Gmail action unavailable.");
    const data: unknown = await response.json();
    if (kind === "messages") return [gmailMessageState(id).parse(data)];
    return z
      .object({ id: z.literal(id), messages: z.array(gmailMessageState()).min(1) })
      .parse(data).messages;
  }
  const confirmed = (states: Awaited<ReturnType<typeof parse>>) =>
    states === null ||
    states.every((state) =>
      trash
        ? !!(state.flags & mailFlag.trash)
        : !!(state.flags & mailFlag.unread) === (action === "markUnread"),
    );
  try {
    const response = await call(true);
    if (response.status < 500 && response.status !== 408) {
      const states = await parse(response);
      if (!states) return null;
      // Thread POSTs can return only part of the thread. Read its complete membership
      // before reconciling the cache. Single-message POSTs can also omit the labels.
      if (kind === "messages" && confirmed(states) && states[0]!.labelIds.length) return states;
    }
  } catch (error) {
    signal.throwIfAborted();
    const lost = error instanceof TypeError || error instanceof DOMException;
    const incomplete = error instanceof SyntaxError || error instanceof z.ZodError;
    if (!lost && !incomplete) throw error;
  }
  const actual = await parse(await call(false));
  if (confirmed(actual)) return actual;
  throw new Error("Gmail did not confirm the change.");
}
