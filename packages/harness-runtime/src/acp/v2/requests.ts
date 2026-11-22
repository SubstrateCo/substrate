import type { AcpClientRequest } from "../driver.ts";
import { elicitationRequest } from "../elicitation-request.ts";
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

/**
 * The host answers with an ACP elicitation response: accept with content, decline or cancel.
 * v2 accepts any JSON value in accepted content (ElicitationContentValue, types.gen.d.ts:7741).
 * Exactly one of sessionId (ElicitationSessionScope :1146) or requestId
 * (ElicitationRequestScope :1163).
 */
export function elicitationRequestV2(
  request: CreateElicitationRequest,
): AcpClientRequest<CreateElicitationResponse> {
  return elicitationRequest(request, z.json());
}
