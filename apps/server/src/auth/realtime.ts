import { realtimeKeys } from "@startup-os/contracts/realtime";
import { invitationRefreshHints, profileRefreshHints } from "@startup-os/database/realtime";

import { publishRefresh } from "../v1/realtime/publisher";
import { db } from "./database";

export function publishSessionChange(session: { userId: string }) {
  return publishRefresh([{ audience: realtimeKeys.user(session.userId), domain: "session" }]);
}

export function publishProfileChange(user: { id: string }) {
  return publishRefresh(profileRefreshHints(db, user.id));
}

export function publishMembershipChange(input: {
  organization: { id: string };
  user: { id: string };
}) {
  return publishRefresh([
    { audience: realtimeKeys.organization(input.organization.id), domain: "access" },
    { audience: realtimeKeys.user(input.user.id), domain: "access" },
  ]);
}

export function publishInvitationChange(input: {
  invitation: { organizationId: string; email: string };
}) {
  const { organizationId, email } = input.invitation;
  return publishRefresh(invitationRefreshHints(db, organizationId, email));
}

export function publishOrganizationChange(input: { member: { organizationId: string } }) {
  return publishRefresh([
    { audience: realtimeKeys.organization(input.member.organizationId), domain: "organization" },
  ]);
}

export function publishOrganizationDeletion(input: {
  organization: { id: string };
  user: { id: string };
}) {
  return publishRefresh([
    { audience: realtimeKeys.organization(input.organization.id), domain: "organization" },
    { audience: realtimeKeys.user(input.user.id), domain: "organization" },
  ]);
}
