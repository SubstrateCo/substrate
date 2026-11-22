import type { AcpClientRequest } from "../driver.ts";
import { elicitationRequest } from "../elicitation-request.ts";
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

// ElicitationContentValue (dist/v1/unstable/schema/types.gen.d.ts:6632).
const elicitationValue = z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]);

/**
 * The host answers with an ACP elicitation response: accept with content, decline or cancel.
 * Request-scoped elicitation (ElicitationRequestScope, types.gen.d.ts:886) has no session.
 */
export function elicitationRequestV1(
  request: CreateElicitationRequest,
): AcpClientRequest<CreateElicitationResponse> {
  return elicitationRequest(request, elicitationValue);
}
