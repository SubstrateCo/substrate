import type { SharingAcceptance, SharingInvitation } from "@/api/messaging/sharing";
import { ApiError } from "@/api/result";

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

export type InvitationOutcome<T extends Invitation = Invitation> =
  | { kind: "loading" }
  | { kind: "failed" }
  | { kind: "declined" }
  | { kind: "accepted"; workspace: AcceptedWorkspace }
  | { kind: "approval" }
  | { kind: "respond"; invitation: T }
  | { kind: "missing" }
  | { kind: "closed" };

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
