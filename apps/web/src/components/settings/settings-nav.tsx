import {
  PageSidebar,
  PageSidebarContent,
  PageSidebarHeader,
  SidebarNav,
} from "@/components/layout/page-layout";
import type { LucideIcon } from "lucide-react";

type SettingsPath =
  | "/settings/user"
  | "/settings/user/preferences"
  | "/settings/user/invitations"
  | "/settings/user/calendars"
  | "/settings/organization"
  | "/settings/organization/apps"
  | "/settings/organization/members"
  | "/settings/organization/invitations"
  | "/settings/organization/conversations"
  | "/settings/organization/sharing";

export type SettingsNavGroup = {
  label: string;
  items: readonly { to: SettingsPath; label: string; icon: LucideIcon }[];
};

/** The settings sidebar: account sections, then the active organization's sections. */
export function SettingsNav({ groups }: { groups: readonly SettingsNavGroup[] }) {
  return (
    <PageSidebar aria-label="Settings">
      <PageSidebarHeader title="Settings" />
      <PageSidebarContent>
        <SidebarNav
          label="Settings sections"
          groups={groups.map((group) => ({
            label: group.label,
            items: group.items.map(({ to, label, icon }) => ({
              key: to,
              label,
              icon,
              link: { to, activeOptions: { exact: true, includeSearch: false } },
            })),
          }))}
        />
      </PageSidebarContent>
    </PageSidebar>
  );
}
