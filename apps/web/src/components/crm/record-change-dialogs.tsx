import type { CrmKind } from "./crm-types";
import { RecordArchive } from "./record-archive";
import type { RecordChangeDialog } from "./record-change-dialog";
import { RecordEditor, type RecordDraft } from "./record-editor";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { useRecordMutation } from "@/queries/records/mutations";

export function RecordChangeDialogs({
  dialog,
  kind,
  entityId,
  name,
  archived,
  record,
  onClose,
}: {
  dialog: RecordChangeDialog;
  kind: CrmKind;
  entityId: string;
  name: string;
  archived: boolean;
  record: RecordDraft;
  onClose: () => void;
}) {
  const { organizationId } = useWorkspaceScope();
  const mutation = useRecordMutation(organizationId, kind);
  if (dialog === "edit")
    return (
      <RecordEditor
        kind={kind}
        record={record}
        pending={mutation.isPending}
        error={mutation.error}
        onClose={onClose}
        onSubmit={(write) => mutation.mutate(write, { onSuccess: onClose })}
      />
    );
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
}
