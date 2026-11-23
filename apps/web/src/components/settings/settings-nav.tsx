import { Link } from "@tanstack/react-router";

import {
  PageSidebar,
  PageSidebarContent,
  PageSidebarHeader,
} from "@/components/layout/page-layout";
import { Button } from "@/components/ui/button";
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
        <nav aria-label="Settings sections" className="space-y-5">
          {groups.map((group) => (
            <div key={group.label} className="space-y-1">
              <h2 className="truncate px-2 text-xs font-medium text-muted-foreground">
                {group.label}
              </h2>
              <ul className="flex gap-0.5 overflow-x-auto md:flex-col">
                {group.items.map(({ to, label, icon: Icon }) => (
                  <li key={to} className="shrink-0">
                    <Button asChild variant="sidebar" className="w-full justify-start">
                      <Link to={to} activeOptions={{ exact: true, includeSearch: false }}>
                        <Icon aria-hidden="true" className="text-muted-foreground" />
                        <span className="truncate">{label}</span>
                      </Link>
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </PageSidebarContent>
    </PageSidebar>
  );
}
