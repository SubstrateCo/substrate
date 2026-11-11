import { realtimeKeys, type RealtimeHint } from "@substrate/contracts/realtime";
import { invitationRefreshHints, profileRefreshHints } from "@substrate/database/realtime";
import type { Database } from "@substrate/database/trusted";

import type { createRefreshPublisher } from "../v1/realtime/publisher";

export function createAuthPublisher(
  db: Database,
  publishRefresh: ReturnType<typeof createRefreshPublisher>,
) {
  function publishSessionChange(session: { userId: string }) {
    return publishRefresh([{ audience: realtimeKeys.user(session.userId), domain: "session" }]);
  }

  function publishProfileChange(user: { id: string }) {
    return publishRefresh(profileRefreshHints(db, user.id));
  }

  function publishMembershipChange(
    input: {
      organization: { id: string };
      user: { id: string };
    },
    hints: RealtimeHint[] = [],
  ) {
    return publishRefresh([
      ...hints,
      { audience: realtimeKeys.organization(input.organization.id), domain: "access" },
      { audience: realtimeKeys.user(input.user.id), domain: "access" },
    ]);
  }

  function publishInvitationChange(input: {
    invitation: { organizationId: string; email: string };
  }) {
    const { organizationId, email } = input.invitation;
    return publishRefresh(invitationRefreshHints(db, organizationId, email));
  }

  function publishOrganizationChange(input: { member: { organizationId: string } }) {
    return publishRefresh([
      { audience: realtimeKeys.organization(input.member.organizationId), domain: "organization" },
    ]);
  }

  function publishOrganizationDeletion(input: {
    organization: { id: string };
    user: { id: string };
  }) {
    return publishRefresh([
      { audience: realtimeKeys.organization(input.organization.id), domain: "organization" },
      { audience: realtimeKeys.user(input.user.id), domain: "organization" },
    ]);
  }
  return {
    publishSessionChange,
    publishProfileChange,
    publishMembershipChange,
    publishInvitationChange,
    publishOrganizationChange,
    publishOrganizationDeletion,
  };
}
