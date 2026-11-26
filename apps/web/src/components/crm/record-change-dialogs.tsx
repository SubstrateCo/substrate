import type { CrmKind } from "./crm-types";
import { RecordArchive } from "./record-archive";
import type { RecordChangeDialog } from "./record-change-dialog";
import { RecordEditor, type RecordDraft } from "./record-editor";
import type { ComboboxOption } from "@/components/ui/combobox";
import type { useRecordMutation } from "@/queries/records/mutations";

const noOptions: ComboboxOption[] = [];

/** Renders the edit or archive dialog of a CRM record detail and closes it after a successful change. */
export function RecordChangeDialogs({
  dialog,
  kind,
  organizationId,
  entityId,
  name,
  archived,
  record,
  accounts = noOptions,
  contacts = noOptions,
  stages = noOptions,
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
  accounts?: ComboboxOption[];
  contacts?: ComboboxOption[];
  stages?: ComboboxOption[];
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
