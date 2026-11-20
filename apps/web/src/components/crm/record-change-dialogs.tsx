import type { CrmKind } from "./crm-types";
import { RecordArchive } from "./record-archive";
import { RecordEditor, type RecordDraft } from "./record-editor";
import type { useRecordMutation } from "@/queries/records/mutations";

type Option = { value: string; label: string };

export type RecordChangeDialog = "edit" | "archive";

/** Narrows a detail view's dialog state to the dialogs that RecordChangeDialogs renders. */
// oxlint-disable-next-line deslop/prefer-literal-union -- Detail views also supply domain-specific dialog names; this guard rejects those.
export function recordChangeDialog(dialog: string | null): RecordChangeDialog | null {
  return dialog === "edit" || dialog === "archive" ? dialog : null;
}

/** Renders the edit or archive dialog of a CRM record detail and closes it after a successful change. */
export function RecordChangeDialogs({
  dialog,
  kind,
  organizationId,
  entityId,
  name,
  archived,
  record,
  accounts = [],
  contacts = [],
  stages = [],
  mutation,
  onClose,
}: {
  dialog: RecordChangeDialog;
  kind: CrmKind;
  organizationId: string;
  entityId: string;
  name: string;
  archived: boolean;
  record: RecordDraft | null;
  accounts?: Option[];
  contacts?: Option[];
  stages?: Option[];
  mutation: ReturnType<typeof useRecordMutation>;
  onClose: () => void;
}) {
  if (dialog === "edit" && record)
    return (
      <RecordEditor
        kind={kind}
        organizationId={organizationId}
        record={record}
        accounts={accounts}
        contacts={contacts}
        stages={stages}
        pending={mutation.isPending}
        error={mutation.error}
        onClose={onClose}
        onSubmit={(write) => mutation.mutate(write, { onSuccess: onClose })}
      />
    );
  if (dialog === "archive")
    return (
      <RecordArchive
        name={name}
        archived={archived}
        pending={mutation.isPending}
        error={mutation.error}
        onClose={onClose}
        onConfirm={() =>
          mutation.mutate(
            { action: "archive", organizationId, entityId, archived: !archived },
            { onSuccess: onClose },
          )
        }
      />
    );
  return null;
}
