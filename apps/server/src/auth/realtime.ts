import { realtimeKeys, type RealtimeHint } from "@substrate/contracts/realtime";
import { invitationRefreshHints, profileRefreshHints } from "@substrate/database/realtime";
import type { Database } from "@substrate/database/trusted";

import type { CommittedPublisher } from "../v1/realtime/committed";

// Better Auth runs these hooks after its own writes commit, so their hints publish as committed.
export function createAuthPublisher(db: Database, publish: CommittedPublisher) {
  async function publishRefresh(hints: RealtimeHint[] | Promise<RealtimeHint[]>) {
    let resolved: RealtimeHint[];
    try {
      resolved = await hints;
    } catch {
      // A failed hint lookup must not fail the auth request. Clients resync on reconnect.
      console.warn("Realtime publish failed; clients will resync");
      return;
    }
    await publish({ result: undefined, hints: resolved });
  }

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
