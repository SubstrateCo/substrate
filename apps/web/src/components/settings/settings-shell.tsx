import { organizationSettingsAccess } from "@substrate/contracts/auth/settings-access";

import { useQuery } from "@tanstack/react-query";

import type { ReactNode } from "react";

import { PageContent, PageLayout } from "@/components/layout/page-layout";
import { SettingsNav, type SettingsNavGroup } from "@/components/settings/settings-nav";
import { currentOrganizationQueryOptions } from "@/queries/organizations/options";
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

// The frame of user and organization settings: section links on the left and the open section
// on the right. Organization sections appear only for the active organization's owners and
// admins; the server still checks the role on every request.
export function SettingsShell({
  organizationId,
  children,
}: {
  organizationId: string | null;
  children: ReactNode;
}) {
  const organization = useQuery({
    ...currentOrganizationQueryOptions(organizationId ?? ""),
    enabled: !!organizationId,
  });
  const access = organizationSettingsAccess(
    organization.data?.id === organizationId ? organization.data.role : undefined,
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
    <PageLayout id="settings" aria-label="Settings">
      <SettingsNav groups={groups} />
      <PageContent className="overflow-y-auto p-6">{children}</PageContent>
    </PageLayout>
  );
}
