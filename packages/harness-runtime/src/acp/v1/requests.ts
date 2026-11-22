import { HarnessError } from "../../errors.ts";
import type { AcpClientRequest } from "../driver.ts";
import { permissionRequest } from "../permission-request.ts";
import type {
  CreateElicitationRequest,
  CreateElicitationResponse,
  RequestPermissionRequest,
  RequestPermissionResponse,
} from "@agentclientprotocol/sdk/unstable";
import { z } from "zod";

/** The host answers with one of the request's optionIds. null or undefined cancels. */
export function permissionRequestV1(
  request: RequestPermissionRequest,
): AcpClientRequest<RequestPermissionResponse> {
  return permissionRequest(request);
}

const sessionScope = z.object({ sessionId: z.string() });

// ElicitationContentValue (dist/v1/unstable/schema/types.gen.d.ts:6632).
const elicitationResponse = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("accept"),
    content: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]))
      .nullish(),
  }),
  z.strictObject({ action: z.literal("decline") }),
  z.strictObject({ action: z.literal("cancel") }),
]);

/** The host answers with an ACP elicitation response: accept with content, decline or cancel. */
export function elicitationRequestV1(
  request: CreateElicitationRequest,
): AcpClientRequest<CreateElicitationResponse> {
  const opened: AcpClientRequest<CreateElicitationResponse> = {
    kind: "input",
    data: request,
    deny: () => ({ action: "decline" }),
    cancelled: () => ({ action: "cancel" }),
    parse: (response) => {
      const parsed = elicitationResponse.safeParse(response);
      if (!parsed.success)
        throw new HarnessError(
          "invalid-response",
          'Answer with {action:"accept", content}, {action:"decline"} or {action:"cancel"}.',
        );
      return parsed.data;
    },
  };
  // Request-scoped elicitation (ElicitationRequestScope, types.gen.d.ts:886) has no session.
  const scope = sessionScope.safeParse(request);
  if (scope.success) opened.sessionId = scope.data.sessionId;
  return opened;
}
