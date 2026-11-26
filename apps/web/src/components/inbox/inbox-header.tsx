import type { Mailbox } from "@substrate/contracts/mail";
import type { MailLabelFilter } from "@substrate/contracts/mail/ipc";

import type { RefObject } from "react";

import { labelChoices, labelOptionValue, parseLabelOptionValue } from "./label-filter-value";
import { defaultLabelColor, ink, labelName } from "./mail-colors";
import type { FolderView } from "./mail-views";
import { MailboxPicker, MobileViewPicker, type MailboxNav, type ViewNav } from "./mailboxes/mailboxes";
import { LabelDisplayToggle } from "./message-labels";
import { FilterBar, type FilterField, type FilterValue } from "@/components/filters";
import { PageHeader } from "@/components/layout/page-header";
import { RowAction } from "@/components/layout/row-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefreshCw, Tag } from "lucide-react";

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

/**
 * The active label as an editable "Label is …" pill. Choosing a label opens it as the sidebar
 * does; removing the pill goes back to the inbox. Mailboxes and folders stay navigation.
 */
export function LabelFilterBar({
  boxes,
  scope,
  filter,
  onLabel,
  onClear,
}: {
  boxes: readonly Mailbox[];
  /** The chosen mailbox, or null for all inboxes. */
  scope: Mailbox | null;
  filter: MailLabelFilter | undefined;
  onLabel: (label: MailLabelFilter) => void;
  onClear: () => void;
}) {
  const choices = labelChoices(boxes, scope, filter);
  if (!choices.length) return null;
  const grouped = !scope && boxes.length > 1;
  const fields: FilterField<"label">[] = [
    {
      id: "label",
      label: "Label",
      icon: Tag,
      kind: "option",
      options: choices.map(({ box, label }) => ({
        value: labelOptionValue({ mailboxId: box.id, id: label.id }),
        label: labelName(label),
        icon: (
          <Tag
            aria-hidden
            className={`size-3.5 fill-current ${ink[label.color ?? defaultLabelColor(label)]}`}
          />
        ),
        group: grouped ? box.address : undefined,
      })),
    },
  ];
  const value: FilterValue<"label"> = filter
    ? { label: { operator: "is", values: [labelOptionValue(filter)] } }
    : {};
  return (
    <div className="shrink-0 border-b px-4 py-2">
      <FilterBar
        aria-label="Mail filters"
        fields={fields}
        value={value}
        // The pill's own remove button is the only reset; one field needs no "Clear filters".
        clearable={false}
        onValueChange={(next) => {
          const chosen = parseLabelOptionValue(next.label?.values[0]);
          if (chosen) onLabel(chosen);
          else onClear();
        }}
      />
    </div>
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
