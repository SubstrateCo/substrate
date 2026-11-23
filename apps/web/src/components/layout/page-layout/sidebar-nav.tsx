import { Link, type LinkProps } from "@tanstack/react-router";

import { Button } from "../../ui/button";
import { PageSidebarGroupTitle } from "./page-sidebar";
import type { LucideIcon } from "lucide-react";

type SidebarNavItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  link: LinkProps;
  /** Marks the row as the open page. Leave it out to let the router decide. */
  current?: boolean;
};

type SidebarNavGroup = { label: string; items: readonly SidebarNavItem[] };

/**
 * The link list of a page sidebar: a column of `h-8` rows, or a scrolling row below `md`.
 * Pass `items` for one flat list, or `groups` for titled groups.
 */
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
              {/* The icon takes the row colour: muted at rest, the selected colour when open. */}
              <Icon aria-hidden="true" />
              <span className="truncate">{label}</span>
            </Link>
          </Button>
        </li>
      ))}
    </ul>
  );
}
