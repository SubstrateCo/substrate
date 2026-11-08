import { Spinner } from "../../ui/spinner";
import type { ReferenceKind } from "./reference-picker";
import { plainReferenceText } from "./reference-token";
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
  const Icon = reference ? icons[reference.kind] : LockKeyhole;
  const content = (
    <>
      {loading && !reference ? (
        <Spinner aria-hidden="true" className="inline size-3.5 align-text-bottom" />
      ) : (
        <Icon aria-hidden="true" className="inline size-3.5 shrink-0 align-text-bottom" />
      )}{" "}
      <span className="truncate">
        {(reference && plainReferenceText(reference.label)) ??
          (loading ? "Loading reference…" : "Unavailable reference")}
      </span>
    </>
  );
  const className =
    "inline-flex max-w-full items-center gap-1 rounded-md bg-accent px-1.5 py-0.5 align-baseline text-sm font-medium text-accent-foreground box-decoration-clone ring-1 ring-inset ring-border/50";
  return reference?.href ? (
    <a
      href={reference.href}
      className={`${className} hover:bg-accent/80 focus-visible:outline-2 focus-visible:outline-ring`}
      title={reference.label}
    >
      {content}
    </a>
  ) : (
    <span
      className={className}
      title={reference?.label}
      role={loading && !reference ? "status" : undefined}
      aria-label={loading && !reference ? "Loading reference…" : undefined}
    >
      {content}
    </span>
  );
}
