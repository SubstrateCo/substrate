import { Spinner } from "../../ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import type { ReferenceKind } from "./reference-picker";
import { plainReferenceText } from "./reference-token";
import { PersonCardTarget, useHasPersonCard } from "@/components/messaging/people/person-card-slot";
import { AtSign, CircleCheck, FolderKanban, LockKeyhole, Hash, MessagesSquare } from "lucide-react";

export type WorkspaceReference = {
  id: string;
  kind: ReferenceKind;
  label: string;
  href?: string;
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
    task: CircleCheck,
    project: FolderKanban,
    channel: Hash,
    thread: MessagesSquare,
  };
  const hasPersonCard = useHasPersonCard();
  const Icon = reference ? icons[reference.kind] : LockKeyhole;
  const content = (
    <>
      {loading && !reference ? (
        <Spinner aria-hidden="true" className="size-3.5 shrink-0 self-center" />
      ) : (
        <Icon aria-hidden="true" className="size-3.5 shrink-0 self-center opacity-70" />
      )}
      <span className="truncate">
        {(reference && plainReferenceText(reference.label)) ??
          (loading ? "Loading reference…" : "Unavailable reference")}
      </span>
    </>
  );
  const className =
    "inline-flex max-w-full items-baseline gap-1 rounded-md bg-accent px-1.5 align-baseline text-sm leading-5 font-medium text-accent-foreground no-underline ring-1 ring-border/50 ring-inset";
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
  if (!reference.href && reference.kind === "person" && hasPersonCard)
    return (
      <PersonCardTarget actorId={reference.id} name={label}>
        <span className={`${className} hover:bg-accent/80`}>{content}</span>
      </PersonCardTarget>
    );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {reference.href ? (
          <a
            href={reference.href}
            data-slot="entity-reference"
            className={`${className} hover:bg-accent/80 focus-visible:outline-2 focus-visible:outline-ring`}
          >
            {content}
          </a>
        ) : (
          <span className={className}>{content}</span>
        )}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
