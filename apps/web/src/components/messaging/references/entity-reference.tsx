import type { ReferenceKind } from "@substrate/contracts/messaging/references";
import type { TaskStatus } from "@substrate/contracts/tasks";

import { Link } from "@tanstack/react-router";

import type { ReactNode } from "react";

import { entityKinds } from "@/components/context/entity-kinds";
import { useHasPersonCard } from "@/components/messaging/people/person-card-context";
import { PersonCardTarget } from "@/components/messaging/people/person-card-slot";
import { TaskStatusIcon } from "@/components/tasks/task-cues/task-status-icon";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { plainReferenceText } from "@/lib/messaging/reference-token";
import type { RecordLink } from "@/lib/navigation/record-links";
import { AtSign, LockKeyhole } from "lucide-react";

export type WorkspaceReference = {
  id: string;
  kind: ReferenceKind;
  label: string;
  link?: RecordLink;
  status?: { value: TaskStatus; label: string };
};

const referenceIcons = {
  person: AtSign,
  agent: entityKinds.agent.icon,
  task: entityKinds.task.icon,
  project: entityKinds.project.icon,
  channel: entityKinds.channel.icon,
  thread: entityKinds.thread.icon,
};

const referenceClass =
  "inline-flex max-w-full items-baseline gap-1 rounded-md bg-accent px-1 align-baseline text-sm font-medium text-accent-foreground no-underline ring-1 ring-border ring-inset";

export function EntityReference({
  reference,
  loading = false,
}: {
  reference?: WorkspaceReference;
  loading?: boolean;
}) {
  if (reference) return <ResolvedReference reference={reference} />;
  if (loading) return <LoadingReference />;
  return <UnavailableReference />;
}

function LoadingReference() {
  return (
    <span className={referenceClass} role="status" aria-label="Loading reference">
      <Spinner aria-hidden="true" className="size-3.5 shrink-0 self-center" />
      <span className="truncate">Loading reference</span>
    </span>
  );
}

function UnavailableReference() {
  return (
    <span className={referenceClass}>
      <LockKeyhole aria-hidden="true" className="size-3.5 shrink-0 self-center opacity-70" />
      <span className="truncate">Unavailable reference</span>
    </span>
  );
}

function ResolvedReference({ reference }: { reference: WorkspaceReference }) {
  const hasPersonCard = useHasPersonCard();
  const label = plainReferenceText(reference.label);
  const { status, link } = reference;
  const content = <ReferenceContent reference={reference} label={label} />;
  const tooltip = status ? `${label} · ${status.label}` : label;
  if (link)
    return (
      <ReferenceTooltip label={tooltip}>
        <Link
          {...link}
          data-slot="entity-reference"
          className={`${referenceClass} hover:bg-row-selected focus-visible:outline-2 focus-visible:outline-ring`}
        >
          {content}
        </Link>
      </ReferenceTooltip>
    );
  if ((reference.kind === "person" || reference.kind === "agent") && hasPersonCard)
    return (
      <PersonCardTarget actorId={reference.id} name={label}>
        <span className={`${referenceClass} hover:bg-row-selected`}>{content}</span>
      </PersonCardTarget>
    );
  return (
    <ReferenceTooltip label={tooltip}>
      <span className={referenceClass}>{content}</span>
    </ReferenceTooltip>
  );
}

function ReferenceContent({ reference, label }: { reference: WorkspaceReference; label: string }) {
  const { status } = reference;
  if (status)
    return (
      <>
        <span className="flex shrink-0 self-center [&>svg]:size-3.5">
          <TaskStatusIcon status={status.value} />
        </span>
        <span className="truncate">{label}</span>
        <span className="sr-only">, {status.label}</span>
      </>
    );
  const Icon = referenceIcons[reference.kind];
  return (
    <>
      <Icon aria-hidden="true" className="size-3.5 shrink-0 self-center opacity-70" />
      <span className="truncate">{label}</span>
    </>
  );
}

function ReferenceTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
