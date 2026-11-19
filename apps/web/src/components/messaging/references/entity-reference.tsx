import type { TaskStatus } from "@substrate/contracts/tasks";

import { Link } from "@tanstack/react-router";

import type { ReactNode } from "react";

import { Spinner } from "../../ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import type { ReferenceKind } from "./reference-picker";
import { PersonCardTarget, useHasPersonCard } from "@/components/messaging/people/person-card-slot";
import { TaskStatusIcon } from "@/components/tasks/task-cues/task-status-icon";
import { plainReferenceText } from "@/lib/messaging/reference-token";
import type { RecordLink } from "@/lib/navigation/record-links";
import {
  AtSign,
  Bot,
  ListTodo,
  FolderKanban,
  LockKeyhole,
  Hash,
  MessagesSquare,
} from "lucide-react";

export type WorkspaceReference = {
  id: string;
  kind: ReferenceKind;
  label: string;
  link?: RecordLink;
  /** Tasks only: shown as the chip's icon, with the label for screen readers. */
  status?: { value: TaskStatus; label: string };
};

export function EntityReference({
  reference,
  loading = false,
}: {
  reference?: WorkspaceReference;
  loading?: boolean;
}) {
  const icons = {
    person: AtSign,
    agent: Bot,
    task: ListTodo,
    project: FolderKanban,
    channel: Hash,
    thread: MessagesSquare,
  };
  const hasPersonCard = useHasPersonCard();
  const Icon = reference ? icons[reference.kind] : LockKeyhole;
  let statusIcon: ReactNode;
  if (loading && !reference)
    statusIcon = <Spinner aria-hidden="true" className="size-3.5 shrink-0 self-center" />;
  else if (reference?.status)
    statusIcon = (
      <span className="flex shrink-0 self-center [&>svg]:size-3.5">
        <TaskStatusIcon status={reference.status.value} />
      </span>
    );
  const content = (
    <>
      {statusIcon ?? (
        <Icon aria-hidden="true" className="size-3.5 shrink-0 self-center opacity-70" />
      )}
      <span className="truncate">
        {(reference && plainReferenceText(reference.label)) ??
          (loading ? "Loading reference…" : "Unavailable reference")}
      </span>
      {reference?.status && <span className="sr-only">, {reference.status.label}</span>}
    </>
  );
  const className =
    "inline-flex max-w-full items-baseline gap-1 rounded-md bg-primary/10 px-1 align-baseline text-sm leading-5 font-medium text-primary no-underline ring-1 ring-border/50 ring-inset";
  if (!reference)
    return (
      <span
        className={className}
        role={loading ? "status" : undefined}
        aria-label={loading ? "Loading reference…" : undefined}
      >
        {content}
      </span>
    );
  const label = plainReferenceText(reference.label);
  if (
    !reference.link &&
    (reference.kind === "person" || reference.kind === "agent") &&
    hasPersonCard
  )
    return (
      <PersonCardTarget actorId={reference.id} name={label}>
        <span className={`${className} hover:bg-accent/80`}>{content}</span>
      </PersonCardTarget>
    );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {reference.link ? (
          <Link
            {...reference.link}
            data-slot="entity-reference"
            className={`${className} hover:bg-accent/80 focus-visible:outline-2 focus-visible:outline-ring`}
          >
            {content}
          </Link>
        ) : (
          <span className={className}>{content}</span>
        )}
      </TooltipTrigger>
      <TooltipContent>
        {reference.status ? `${label} · ${reference.status.label}` : label}
      </TooltipContent>
    </Tooltip>
  );
}
