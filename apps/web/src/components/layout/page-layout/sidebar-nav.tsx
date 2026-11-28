import { Link, type LinkProps } from "@tanstack/react-router";

import { PageSidebarGroupTitle } from "./page-sidebar";
import { Button } from "@/components/ui/button";
import type { LucideIcon } from "lucide-react";

type SidebarNavItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  link: LinkProps;
  current?: boolean;
};

type SidebarNavGroup = { label: string; items: readonly SidebarNavItem[] };

export function SidebarNav({
  label,
  ...list
}: { label: string } & (
  | { items: readonly SidebarNavItem[]; groups?: never }
  | { groups: readonly SidebarNavGroup[]; items?: never }
)) {
  return (
    <nav aria-label={label} className="space-y-5">
      {list.groups ? (
        list.groups.map((group) => (
          <div key={group.label} className="flex flex-col gap-0.5">
            <PageSidebarGroupTitle>
              <span className="truncate">{group.label}</span>
            </PageSidebarGroupTitle>
            <SidebarNavList items={group.items} />
          </div>
        ))
      ) : (
        <SidebarNavList items={list.items} />
      )}
    </nav>
  );
}

function SidebarNavList({ items }: { items: readonly SidebarNavItem[] }) {
  return (
    <ul className="flex gap-0.5 overflow-x-auto md:flex-col">
      {items.map(({ key, label, icon: Icon, link, current }) => (
        <li key={key} className="shrink-0">
          <Button asChild variant="sidebar" className="w-full justify-start">
            <Link {...link} aria-current={current ? "page" : undefined}>
              <Icon aria-hidden="true" />
              <span className="truncate">{label}</span>
            </Link>
          </Button>
        </li>
      ))}
    </ul>
  );
}
