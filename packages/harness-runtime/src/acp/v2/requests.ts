import { HarnessError } from "../../errors.ts";
import type { AcpClientRequest } from "../driver.ts";
import { permissionRequest } from "../permission-request.ts";
import type {
  CreateElicitationRequest,
  CreateElicitationResponse,
  RequestPermissionRequest,
  RequestPermissionResponse,
} from "@agentclientprotocol/sdk/experimental/v2/unstable";
import { z } from "zod";

/**
 * The host answers with one of the request's optionIds; null or undefined cancels. In v2,
 * cancelled also means dismissed or declined by policy (RequestPermissionOutcome,
 * dist/v2/unstable/schema/types.gen.d.ts:7638-7640).
 */
export function permissionRequestV2(
  request: RequestPermissionRequest,
): AcpClientRequest<RequestPermissionResponse> {
  return permissionRequest(request);
}

const sessionScope = z.object({ sessionId: z.string() });

// v2 accepts any JSON value in accepted content (ElicitationContentValue, types.gen.d.ts:7741).
const elicitationResponse = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("accept"),
    content: z.record(z.string(), z.json()).nullish(),
  }),
  z.strictObject({ action: z.literal("decline") }),
  z.strictObject({ action: z.literal("cancel") }),
]);

/** The host answers with an ACP elicitation response: accept with content, decline or cancel. */
export function elicitationRequestV2(
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
  // Exactly one of sessionId (ElicitationSessionScope :1146) or requestId
  // (ElicitationRequestScope :1163).
  const scope = sessionScope.safeParse(request);
  if (scope.success) opened.sessionId = scope.data.sessionId;
  return opened;
}
