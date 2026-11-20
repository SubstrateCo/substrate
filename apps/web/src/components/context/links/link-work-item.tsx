import type { ContextEntityType } from "@substrate/contracts/context/input";

import { SkeletonText } from "../../feedback/skeleton-text";
import { Checkbox } from "../../ui/checkbox";
import { CommandItem } from "../../ui/command";
import { Skeleton } from "../../ui/skeleton";
import { cn } from "cn";
import { FolderKanban, ListTodo, Building2, Contact, Handshake, MessageSquare } from "lucide-react";

// oxlint-disable-next-line shadcn/no-restyle -- These are the command item's existing geometry, shared with inert loading rows.
const linkWorkRowClass = "flex min-w-0 items-center gap-2 px-2 py-1.5 text-sm";

export function LinkWorkItem({
  id,
  kind,
  title,
  projectName,
  chosen,
  linked,
  disabled,
  onChoose,
}: {
  id: string;
  kind: ContextEntityType;
  title: string;
  projectName?: string;
  chosen: boolean;
  linked: boolean;
  disabled: boolean;
  onChoose: () => void;
}) {
  const Icon = {
    task: ListTodo,
    project: FolderKanban,
    contact: Contact,
    account: Building2,
    deal: Handshake,
    contact_interaction: MessageSquare,
  }[kind];
  const selected = chosen && !linked;
  let subtitle = {
    task: "Task",
    project: "Project",
    contact: "Contact",
    account: "Account",
    deal: "Deal",
    contact_interaction: "Interaction",
  }[kind];
  if (kind === "task") subtitle = projectName ? `Task · ${projectName}` : "Task";
  return (
    <CommandItem
      value={id}
      disabled={disabled || linked}
      onSelect={onChoose}
      className={linkWorkRowClass}
    >
      <LinkWorkContent
        icon={
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground",
              selected && "bg-primary/10 text-primary",
            )}
          >
            <Icon aria-hidden="true" />
          </span>
        }
        text={
          <>
            <span className="line-clamp-2 font-medium wrap-anywhere">{title}</span>
            <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
          </>
        }
        action={
          linked ? (
            <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
              Linked
            </span>
          ) : (
            <Checkbox
              aria-hidden="true"
              tabIndex={-1}
              checked={selected}
              className="pointer-events-none"
            />
          )
        }
      />
      {selected && <span className="sr-only">Selected</span>}
    </CommandItem>
  );
}

function LinkWorkContent({
  icon,
  text,
  action,
}: {
  icon: React.ReactNode;
  text: React.ReactNode;
  action: React.ReactNode;
}) {
  return (
    <>
      {icon}
      <span className="min-w-0 flex-1">{text}</span>
      {action}
    </>
  );
}

export function LinkWorkLoading() {
  return (
    <div role="status">
      <span className="sr-only">Searching work</span>
      <div aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className={linkWorkRowClass}>
            <LinkWorkContent
              icon={<Skeleton className="size-8 shrink-0" />}
              text={
                <>
                  <span className="block">
                    <SkeletonText width="10rem" />
                  </span>
                  <span className="block text-xs">
                    <SkeletonText width="6rem" />
                  </span>
                </>
              }
              action={<Skeleton className="size-4 shrink-0" />}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
