import {
  mailboxName,
  filterLabels,
  mailViews,
  type Mailbox,
  type MailColor,
  type MailView,
} from "@substrate/contracts/mail";

import { labelFilter } from "../inbox-data";
import { ink, labelName, defaultLabelColor } from "../mail-colors";
import { views } from "../mail-views";
import { SidebarLabels, type LabelNavigation } from "./sidebar-labels";
import { UnreadMailboxes } from "./unread-mailboxes";
import {
  PageSidebar,
  PageSidebarContent,
  PageSidebarHeader,
} from "@/components/layout/page-layout";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronDown, Inbox, Mail, Plus, RefreshCw, Settings, Tag } from "lucide-react";

export type MailboxNav = {
  colors: ReadonlyMap<string, MailColor>;
  connected: readonly Mailbox[];
  scope: Mailbox | null;
  /** All inboxes of more than one mailbox: views and labels are grouped by mailbox. */
  unified: boolean;
  onSelect: (box: Mailbox | null) => void;
  onConnect: () => void;
  onManage: () => void;
};

export type ViewNav = LabelNavigation & {
  unreadByMailbox?: Record<string, number>;
  onMailboxUnread: (box: Mailbox) => void;
  view: MailView;
  onView: (view: MailView) => void;
  counts: Partial<Record<MailView, number>>;
};

function Count({ value }: { value?: number }) {
  return value ? <span className="ml-auto text-xs tabular-nums">{value}</span> : null;
}

export function MailboxSidebar({
  view,
  onView,
  counts,
  unreadByMailbox,
  onMailboxUnread,
  filter,
  onLabel,
  ...accounts
}: MailboxNav & ViewNav) {
  return (
    <PageSidebar aria-label="Mailbox navigation">
      <PageSidebarHeader title="Mail" />
      <PageSidebarContent className="scrollbar-gutter-stable">
        <MailboxPicker {...accounts} />
        {accounts.connected.length > 0 && (
          <nav aria-label="Mail views" className="space-y-0.5">
            {mailViews.map((id) => {
              const { label, icon: Icon } = views[id];
              if (id === "unread" && accounts.unified)
                return (
                  <UnreadMailboxes
                    key={id}
                    boxes={accounts.connected}
                    colors={accounts.colors}
                    counts={unreadByMailbox}
                    selected={!filter && view === "unread"}
                    total={counts.unread}
                    onUnread={() => onView("unread")}
                    onPick={onMailboxUnread}
                  />
                );
              return (
                <div key={id} className={id === "archive" ? "mt-3 border-t pt-3" : undefined}>
                  <Button
                    variant="sidebar"
                    className="w-full justify-start"
                    aria-current={!filter && view === id ? "page" : undefined}
                    title={id === "new" ? "Arrivals in the last 24 hours" : undefined}
                    onClick={() => onView(id)}
                  >
                    <Icon aria-hidden /> {label} <Count value={counts[id]} />
                  </Button>
                </div>
              );
            })}
          </nav>
        )}
        <SidebarLabels
          boxes={accounts.scope ? [accounts.scope] : accounts.connected}
          grouped={accounts.unified}
          colors={accounts.colors}
          filter={filter}
          onLabel={onLabel}
        />
      </PageSidebarContent>
    </PageSidebar>
  );
}

function mailboxSwitchLabel(scope: Mailbox | null) {
  return `Switch mailbox: ${scope ? mailboxName(scope) : "All inboxes"}`;
}

/** The sidebar's mailbox switch, which names the chosen mailbox. */
function MailboxPicker(nav: MailboxNav) {
  const { scope, colors } = nav;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          id="mailbox-switch"
          variant="outline"
          size="sm"
          className="w-full justify-start"
          aria-label={mailboxSwitchLabel(scope)}
          title={scope?.address ?? "All connected Gmail accounts"}
        >
          <Mail aria-hidden />{" "}
          <span
            className={`min-w-0 flex-1 truncate text-left ${scope ? ink[colors.get(scope.id)!] : ""}`}
          >
            {scope ? mailboxName(scope) : "All inboxes"}
          </span>{" "}
          <ChevronDown aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <MailboxMenuContent {...nav} />
    </DropdownMenu>
  );
}

/** The header's icon-only mailbox switch, shown without the sidebar. */
export function CompactMailboxPicker(nav: MailboxNav) {
  const label = mailboxSwitchLabel(nav.scope);
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button id="mailbox-switch" variant="outline" size="icon-sm" aria-label={label}>
              <Mail aria-hidden />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <MailboxMenuContent {...nav} />
    </DropdownMenu>
  );
}

function MailboxMenuContent({
  connected,
  scope,
  colors,
  onSelect,
  onConnect,
  onManage,
}: MailboxNav) {
  return (
    <DropdownMenuContent>
      <DropdownMenuRadioGroup
        value={scope?.id ?? "all"}
        onValueChange={(id) => onSelect(connected.find((box) => box.id === id) ?? null)}
      >
        <DropdownMenuRadioItem value="all">
          <Inbox aria-hidden /> All inboxes
        </DropdownMenuRadioItem>
        {connected.map((box) => (
          <DropdownMenuRadioItem key={box.id} value={box.id}>
            <Mail aria-hidden />
            <span className="min-w-0 truncate" title={box.address}>
              <span className={ink[colors.get(box.id)!]}>{box.address}</span>
              {box.nickname && (
                <span className="ml-2 text-xs text-muted-foreground">{box.nickname}</span>
              )}
            </span>
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={onConnect}>
        <Plus aria-hidden /> Connect Gmail
      </DropdownMenuItem>
      {connected.length > 0 && (
        <DropdownMenuItem onSelect={onManage}>
          <Settings aria-hidden /> Manage mailboxes
        </DropdownMenuItem>
      )}
    </DropdownMenuContent>
  );
}

export function MobileViewPicker({
  view,
  onView,
  counts,
  connected,
  scope,
  unified,
  colors,
  unreadByMailbox,
  onMailboxUnread,
  filter,
  onLabel,
  onSync,
  syncing,
}: ViewNav & MailboxNav & { onSync: () => void; syncing: boolean }) {
  const labelItem = labelFilter(connected, filter).selectedLabel;
  const { icon: Icon, label } = labelItem
    ? { icon: Tag, label: labelName(labelItem) }
    : views[view];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="max-w-full"
          aria-label={`Switch view: ${label}`}
        >
          <Icon aria-hidden className="hidden @sm:inline" />
          <span className="min-w-0 truncate">{label}</span>
          <ChevronDown aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent aria-label="Mail views">
        <div className="min-[384px]:hidden">
          <DropdownMenuItem onSelect={onSync} disabled={syncing}>
            <RefreshCw aria-hidden />
            Sync mail
          </DropdownMenuItem>
          <DropdownMenuSeparator />
        </div>
        <DropdownMenuRadioGroup
          value={filter ? "" : view}
          onValueChange={(value) => {
            const id = mailViews.find((candidate) => candidate === value);
            if (id) onView(id);
          }}
        >
          {mailViews.map((id) => {
            const item = views[id];
            return (
              <DropdownMenuRadioItem key={id} value={id}>
                <item.icon aria-hidden /> {item.label} <Count value={counts[id]} />
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
        {unified && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Unread by mailbox</DropdownMenuLabel>
            {connected.map((box) => (
              <DropdownMenuItem key={box.id} onSelect={() => onMailboxUnread(box)}>
                <Mail aria-hidden />
                <span className={`min-w-0 truncate ${ink[colors.get(box.id)!]}`}>
                  {box.address}
                </span>
                <span className="ml-auto text-xs tabular-nums">
                  {unreadByMailbox ? (unreadByMailbox[box.id] ?? 0) : "…"}
                </span>
              </DropdownMenuItem>
            ))}
          </>
        )}
        {(scope ? [scope] : connected)
          .map((b) => ({ box: b, labels: filterLabels(b) }))
          .filter((g) => g.labels.length)
          .map(({ box: b, labels }) => (
            <div key={b.id}>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{unified ? `Labels · ${b.address}` : "Labels"}</DropdownMenuLabel>
              {labels.map((l) => (
                <DropdownMenuItem
                  key={l.id}
                  onSelect={() => onLabel({ mailboxId: b.id, id: l.id })}
                >
                  <Tag aria-hidden className={ink[l.color ?? defaultLabelColor(l)]} />
                  {labelName(l)}
                </DropdownMenuItem>
              ))}
            </div>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
