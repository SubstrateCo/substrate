import type { Mailbox } from "@substrate/contracts/mail";
import type { MailLabelFilter } from "@substrate/contracts/mail/ipc";

import type { ReactNode, RefObject } from "react";

import { labelChoices, labelOptionValue, parseLabelOptionValue } from "./label-filter-value";
import { defaultLabelColor, ink, labelName } from "./mail-colors";
import type { FolderView } from "./mail-views";
import { LabelDisplayToggle } from "./message-labels";
import { FilterBar, type FilterField, type FilterValue } from "@/components/filters";
import { PageHeader } from "@/components/layout/page-header";
import { RowAction } from "@/components/layout/row-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefreshCw, Tag } from "lucide-react";

export type InboxHeading = { leading?: ReactNode; title: ReactNode; icon?: ReactNode };

export type InboxTools = {
  syncing: boolean;
  onSync: () => void;
  allTags: boolean;
  onToggleTags: () => void;
  field: RefObject<HTMLInputElement | null>;
  search: string;
  onSearch: (value: string) => void;
};

export function InboxHeader({
  heading,
  current,
  tools,
}: {
  heading: InboxHeading;
  current: FolderView;
  tools?: InboxTools;
}) {
  if (!tools) return <PageHeader variant="pane" className="@container" {...heading} />;
  const { syncing, onSync, allTags, onToggleTags, field, search, onSearch } = tools;
  return (
    <PageHeader
      variant="pane"
      className="@container"
      {...heading}
      actions={
        <>
          <LabelDisplayToggle expanded={allTags} onToggle={onToggleTags} />
          <span className="max-[384px]:hidden">
            <RowAction label="Sync mail" disabled={syncing} onClick={onSync}>
              <RefreshCw aria-hidden />
            </RowAction>
          </span>
        </>
      }
    >
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
    </PageHeader>
  );
}

export function LabelFilterBar({
  boxes,
  scope,
  unified,
  filter,
  onLabel,
  onClear,
}: {
  boxes: readonly Mailbox[];
  scope: Mailbox | null;
  unified: boolean;
  filter: MailLabelFilter | undefined;
  onLabel: (label: MailLabelFilter) => void;
  onClear: () => void;
}) {
  const choices = labelChoices(boxes, scope, filter);
  if (!choices.length) return null;
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
        group: unified ? box.address : undefined,
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
  if (problem?.status === "reconnect")
    return (
      <SyncNoticeRow action="Manage mailboxes" onAction={onManage}>
        {problem.address} needs to reconnect.
      </SyncNoticeRow>
    );
  if (!problem && !failed) return null;
  return (
    <SyncNoticeRow action="Retry sync" onAction={() => onSync(problem?.id ?? account)}>
      Sync paused. Cached mail is available.
    </SyncNoticeRow>
  );
}

function SyncNoticeRow({
  action,
  onAction,
  children,
}: {
  action: string;
  onAction: () => void;
  children: ReactNode;
}) {
  return (
    <div
      role="status"
      className="flex items-center gap-2 border-b px-4 py-1 text-xs text-muted-foreground"
    >
      {children}
      <Button size="xs" variant="link" onClick={onAction}>
        {action}
      </Button>
    </div>
  );
}
