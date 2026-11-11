import { organizationSettingsAccess } from "@substrate/contracts/auth/settings-access";

import { useQuery } from "@tanstack/react-query";

import type { ReactNode } from "react";

import { SettingsPage } from "@/components/layout/settings-page";
import { SettingsNav, type SettingsNavGroup } from "@/components/settings/settings-nav";
import { sessionQueryOptions } from "@/queries/auth/session";
import {
  activeMemberQueryOptions,
  organizationQueryOptions,
} from "@/queries/organizations/options";
import {
  Building2,
  Globe,
  Hash,
  Mail,
  Send,
  SlidersHorizontal,
  UserRound,
  Users,
} from "lucide-react";

const accountGroup: SettingsNavGroup = {
  label: "Account",
  items: [
    { to: "/settings/user", label: "Profile", icon: UserRound },
    { to: "/settings/user/preferences", label: "Preferences", icon: SlidersHorizontal },
    { to: "/settings/user/invitations", label: "Your invitations", icon: Mail },
  ],
};

// User and organization settings share this frame. Organization sections appear only for the
// active organization's owners and admins; the server still checks the role on every request.
export function SettingsShell({ children }: { children: ReactNode }) {
  const session = useQuery({ ...sessionQueryOptions(), staleTime: Infinity });
  const organizationId = session.data?.session.activeOrganizationId ?? "";
  const member = useQuery({
    ...activeMemberQueryOptions(organizationId),
    enabled: !!organizationId,
  });
  const organization = useQuery({
    ...organizationQueryOptions(organizationId),
    enabled: !!organizationId,
  });
  const access = organizationSettingsAccess(
    member.data?.organizationId === organizationId ? member.data.role : undefined,
  );
  const groups: SettingsNavGroup[] = [accountGroup];
  if (organizationId && access.allowed)
    groups.push({
      label: organization.data?.name || "Organization",
      items: [
        { to: "/settings/organization", label: "General", icon: Building2 },
        { to: "/settings/organization/members", label: "Members", icon: Users },
        { to: "/settings/organization/invitations", label: "Invitations", icon: Send },
        { to: "/settings/organization/conversations", label: "Conversations", icon: Hash },
        { to: "/settings/organization/sharing", label: "External collaboration", icon: Globe },
      ],
    });
  return (
    <SettingsPage id="settings" label="Settings" sidebar={<SettingsNav groups={groups} />}>
      {children}
    </SettingsPage>
  );
}
