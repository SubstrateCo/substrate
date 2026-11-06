import { Spinner } from "../primitives/spinner";
import type { ReferenceKind } from "./reference-picker";
import { AtSign, CircleCheck, FolderKanban, LockKeyhole } from "lucide-react";

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
  const icons = { person: AtSign, task: CircleCheck, project: FolderKanban };
  const Icon = reference ? icons[reference.kind] : LockKeyhole;
  const content = (
    <>
      {loading && !reference ? (
        <Spinner aria-hidden="true" className="inline size-3.5 align-text-bottom" />
      ) : (
        <Icon aria-hidden="true" className="inline size-3.5 align-text-bottom" />
      )}{" "}
      <span>{reference?.label ?? (loading ? "Loading reference…" : "Unavailable reference")}</span>
    </>
  );
  const className =
    "rounded-md bg-accent px-1.5 py-0.5 text-sm font-medium text-accent-foreground box-decoration-clone";
  return reference?.href ? (
    <a href={reference.href} className={className}>
      {content}
    </a>
  ) : (
    <span
      className={className}
      role={loading && !reference ? "status" : undefined}
      aria-label={loading && !reference ? "Loading reference…" : undefined}
    >
      {content}
    </span>
  );
}
