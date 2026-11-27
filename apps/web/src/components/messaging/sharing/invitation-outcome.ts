import type { SharingAcceptance, SharingInvitation } from "@/api/messaging/sharing";
import { ApiError } from "@/api/result";

/** A 4xx other than a timeout or rate limit will not change on retry. */
export function isPermanentFailure(error: Error | null) {
  return (
    error instanceof ApiError &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 408 &&
    error.status !== 429
  );
}

export type AcceptedWorkspace = { organizationId: string; conversationId: string | null };

type Invitation = Pick<
  SharingInvitation,
  "status" | "expiresAt" | "targetOrganizationId" | "conversationId"
>;

/** What the invitation screen shows below the load notice. */
export type InvitationOutcome<T extends Invitation = Invitation> =
  | { kind: "loading" }
  /** A temporary failure with nothing loaded: the load notice offers a retry. */
  | { kind: "failed" }
  | { kind: "declined" }
  | { kind: "accepted"; workspace: AcceptedWorkspace }
  | { kind: "approval" }
  | { kind: "respond"; invitation: T }
  /** The invitation can't be read for good, such as one sent to another email. */
  | { kind: "missing" }
  /** The invitation loaded but can no longer be answered, such as an expired one. */
  | { kind: "closed" };

/** Answers win over the invitation's state, so a finished response stays on screen. */
export function invitationOutcome<T extends Invitation>({
  invitation,
  result,
  now,
  declined,
  error,
}: {
  invitation: T | undefined;
  result: SharingAcceptance | undefined;
  now: number;
  declined: boolean;
  error: Error | null;
}): InvitationOutcome<T> {
  if (declined) return { kind: "declined" };
  if (result?.status === "accepted")
    return {
      kind: "accepted",
      workspace: { organizationId: result.organizationId, conversationId: result.conversationId },
    };
  if (invitation?.status === "accepted" && invitation.targetOrganizationId)
    return {
      kind: "accepted",
      workspace: {
        organizationId: invitation.targetOrganizationId,
        conversationId: invitation.conversationId,
      },
    };
  if (result?.status === "approval-required") return { kind: "approval" };
  if (isPermanentFailure(error)) return { kind: "missing" };
  if (!invitation) return { kind: error ? "failed" : "loading" };
  if (invitation.status === "pending" && new Date(invitation.expiresAt).getTime() > now)
    return { kind: "respond", invitation };
  return { kind: "closed" };
}
