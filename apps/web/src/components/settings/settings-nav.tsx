import { Link, useLocation } from "@tanstack/react-router";

import { Fragment } from "react";

import {
  PageSidebar,
  PageSidebarContent,
  PageSidebarHeader,
  SidebarNav,
} from "@/components/layout/page-layout";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";
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
  const pathname = useLocation({ select: (location) => location.pathname });
  const active = groups.flatMap((group) => group.items).find((item) => item.to === pathname);
  return (
    <PageSidebar aria-label="Settings">
      <nav aria-label="Settings sections" className="p-3 md:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full min-w-0 justify-between">
              <span className="truncate">Settings: {active?.label ?? "Choose section"}</span>
              <ChevronDown aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {groups.map((group) => (
              <Fragment key={group.label}>
                <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
                {group.items.map(({ to, label, icon: Icon }) => (
                  <DropdownMenuItem key={to} asChild>
                    <Link to={to} aria-current={to === pathname ? "page" : undefined}>
                      <Icon aria-hidden="true" />
                      <span className="truncate">{label}</span>
                    </Link>
                  </DropdownMenuItem>
                ))}
              </Fragment>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
      <PageSidebarHeader title="Settings" className="hidden md:flex" />
      <PageSidebarContent className="hidden md:block">
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
