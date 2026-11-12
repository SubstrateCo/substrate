import { APIError } from "better-auth/api";
import { z } from "zod";

const organizationId = z.string().min(1);
const leaveBody = z.object({ organizationId });
const leftMember = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  organizationId,
});
const createdInvitation = z.object({
  id: z.string().min(1),
  organizationId,
  email: z.email(),
  status: z.literal("pending"),
});

export function createOrganizationLifecycle(deps: {
  clearMembershipSharing(userId: string, organizationId: string): Promise<void>;
  publishMembershipChange(input: {
    user: { id: string };
    organization: { id: string };
  }): Promise<void>;
  publishInvitationChange(input: {
    invitation: { organizationId: string; email: string };
  }): Promise<void>;
}) {
  return async (input: {
    path: string;
    body: unknown;
    returned: unknown;
    session: { user: { id: string } } | null;
  }) => {
    if (input.returned instanceof APIError) return;
    if (input.path === "/organization/leave") {
      const body = leaveBody.safeParse(input.body);
      const member = leftMember.safeParse(input.returned);
      if (!body.success || !member.success || !input.session) return;
      if (
        member.data.userId !== input.session.user.id ||
        member.data.organizationId !== body.data.organizationId
      )
        return;
      const userId = input.session.user.id;
      const organizationId = body.data.organizationId;
      await deps.clearMembershipSharing(userId, organizationId);
      await deps.publishMembershipChange({
        user: { id: userId },
        organization: { id: organizationId },
      });
    }
    if (input.path === "/organization/invite-member") {
      const invitation = createdInvitation.safeParse(input.returned);
      if (!invitation.success) return;
      await deps.publishInvitationChange({
        invitation: {
          organizationId: invitation.data.organizationId,
          email: invitation.data.email,
        },
      });
    }
  };
}
