import type { TaskStatus } from "@substrate/contracts/tasks";

import { Link } from "@tanstack/react-router";

import type { ReferenceKind } from "./reference-picker-view";
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
  /** Tasks only: shown as the chip's icon, with the label for screen readers. */
  status?: { value: TaskStatus; label: string };
};

// A person mention keeps the `@` glyph; every other kind uses its shared icon.
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
  const label = loading ? "Loading reference" : "Unavailable reference";
  return (
    <span
      className={referenceClass}
      role={loading ? "status" : undefined}
      aria-label={loading ? label : undefined}
    >
      {loading ? (
        <Spinner aria-hidden="true" className="size-3.5 shrink-0 self-center" />
      ) : (
        <LockKeyhole aria-hidden="true" className="size-3.5 shrink-0 self-center opacity-70" />
      )}
      <span className="truncate">{label}</span>
    </span>
  );
}

function ResolvedReference({ reference }: { reference: WorkspaceReference }) {
  const hasPersonCard = useHasPersonCard();
  const Icon = referenceIcons[reference.kind];
  const label = plainReferenceText(reference.label);
  const { status } = reference;
  const content = (
    <>
      {status ? (
        <span className="flex shrink-0 self-center [&>svg]:size-3.5">
          <TaskStatusIcon status={status.value} />
        </span>
      ) : (
        <Icon aria-hidden="true" className="size-3.5 shrink-0 self-center opacity-70" />
      )}
      <span className="truncate">{label}</span>
      {status && <span className="sr-only">, {status.label}</span>}
    </>
  );
  if (
    !reference.link &&
    (reference.kind === "person" || reference.kind === "agent") &&
    hasPersonCard
  )
    return (
      <PersonCardTarget actorId={reference.id} name={label}>
        <span className={`${referenceClass} hover:bg-row-selected`}>{content}</span>
      </PersonCardTarget>
    );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {reference.link ? (
          <Link
            {...reference.link}
            data-slot="entity-reference"
            className={`${referenceClass} hover:bg-row-selected focus-visible:outline-2 focus-visible:outline-ring`}
          >
            {content}
          </Link>
        ) : (
          <span className={referenceClass}>{content}</span>
        )}
      </TooltipTrigger>
      <TooltipContent>
        {reference.status ? `${label} · ${reference.status.label}` : label}
      </TooltipContent>
    </Tooltip>
  );
}
