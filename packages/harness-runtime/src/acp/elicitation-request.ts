import { HarnessError } from "../errors.ts";
import type { AcpClientRequest } from "./driver.ts";
import { z } from "zod";

type ElicitationResponse<Value> =
  | { action: "accept"; content?: Record<string, Value> | null }
  | { action: "decline" }
  | { action: "cancel" };

/** ElicitationSessionScope or ElicitationRequestScope, the same in ACP v1 and v2. */
type ElicitationScope = { sessionId: string } | { requestId: unknown };

const sessionScope = z.object({ sessionId: z.string() });

/**
 * The host answers with an ACP elicitation response: accept with content, decline or cancel.
 * `value` is the protocol's schema for one accepted content value.
 */
export function elicitationRequest<Value>(
  request: ElicitationScope,
  value: z.ZodType<Value>,
): AcpClientRequest<ElicitationResponse<Value>> {
  const response = z.discriminatedUnion("action", [
    z.strictObject({
      action: z.literal("accept"),
      content: z.record(z.string(), value).nullish(),
    }),
    z.strictObject({ action: z.literal("decline") }),
    z.strictObject({ action: z.literal("cancel") }),
  ]);
  const opened: AcpClientRequest<ElicitationResponse<Value>> = {
    kind: "input",
    data: request,
    deny: () => ({ action: "decline" }),
    cancelled: () => ({ action: "cancel" }),
    parse: (answer) => {
      const parsed = response.safeParse(answer);
      if (!parsed.success)
        throw new HarnessError(
          "invalid-response",
          'Answer with {action:"accept", content}, {action:"decline"} or {action:"cancel"}.',
        );
      return parsed.data;
    },
  };
  // A request-scoped elicitation has no session.
  const scope = sessionScope.safeParse(request);
  if (scope.success) opened.sessionId = scope.data.sessionId;
  return opened;
}
