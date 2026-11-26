import type { Mailbox } from "@substrate/contracts/mail";

import type { RefObject } from "react";

import type { FolderView } from "./mail-views";
import { MailboxPicker, MobileViewPicker, type MailboxNav, type ViewNav } from "./mailboxes";
import { LabelDisplayToggle } from "./message-labels";
import { PageHeader } from "@/components/layout/page-header";
import { RowAction } from "@/components/layout/row-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefreshCw } from "lucide-react";

export function InboxHeader({
  sidebar,
  nav,
  viewNav,
  current,
  syncing,
  onSync,
  allTags,
  onToggleTags,
  field,
  search,
  onSearch,
}: {
  sidebar: boolean;
  nav: MailboxNav;
  viewNav: ViewNav;
  current: FolderView;
  syncing: boolean;
  onSync: () => void;
  allTags: boolean;
  onToggleTags: () => void;
  field: RefObject<HTMLInputElement | null>;
  search: string;
  onSearch: (value: string) => void;
}) {
  const hasBoxes = nav.connected.length > 0;
  return (
    <PageHeader
      variant="pane"
      className="@container"
      leading={!sidebar && <MailboxPicker {...nav} compact />}
      title={
        sidebar || !nav.connected.length ? (
          current.label
        ) : (
          <MobileViewPicker {...viewNav} {...nav} onSync={onSync} syncing={syncing} />
        )
      }
      icon={sidebar ? <current.icon aria-hidden /> : undefined}
      actions={
        hasBoxes && (
          <>
            <LabelDisplayToggle expanded={allTags} onToggle={onToggleTags} />
            <span className="max-[384px]:hidden">
              <RowAction label="Sync mail" disabled={syncing} onClick={onSync}>
                <RefreshCw aria-hidden />
              </RowAction>
            </span>
          </>
        )
      }
    >
      {hasBoxes && (
        <div className="max-w-xs min-w-0">
          <Input
            ref={field}
            type="search"
            maxLength={500}
            aria-label="Search messages"
            placeholder={`Search ${current.label.toLowerCase()}…`}
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>
      )}
    </PageHeader>
  );
}

/** A sync problem, with the action that fixes it. */
export function SyncNotice({
  problem,
  failed,
  account,
  onManage,
  onSync,
}: {
  problem: Mailbox | undefined;
  failed: boolean;
  account: string | null;
  onManage: () => void;
  onSync: (mailboxId: string | null) => void;
}) {
  if (!problem && !failed) return null;
  const reconnect = problem?.status === "reconnect";
  return (
    <div
      role="status"
      className="flex items-center gap-2 border-b px-4 py-1 text-xs text-muted-foreground"
    >
      {reconnect
        ? `${problem.address} needs to reconnect.`
        : "Sync paused. Cached mail is available."}
      <Button
        size="xs"
        variant="link"
        onClick={() => (reconnect ? onManage() : onSync(problem?.id ?? account))}
      >
        {reconnect ? "Manage mailboxes" : "Retry sync"}
      </Button>
    </div>
  );
}
