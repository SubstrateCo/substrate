import { useState } from "react";

import { CustomerPicker } from "@/components/crm/customer-picker";
import { InteractionEditor } from "@/components/interactions/interaction-editor";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { useInteractionMutation } from "@/queries/context/interactions";

export function NewInteraction({
  contactId,
  onClose,
}: {
  contactId?: string;
  onClose: () => void;
}) {
  const { organizationId } = useWorkspaceScope();
  const [contact, setContact] = useState(contactId ?? "");
  const mutation = useInteractionMutation(organizationId);
  return (
    <InteractionEditor
      pending={mutation.isPending}
      error={mutation.error}
      canSubmit={!!contact}
      contactField={
        <CustomerPicker kind="contacts" label="Contact" value={contact} onChange={setContact} />
      }
      onClose={onClose}
      onSubmit={(draft) =>
        mutation.mutate(
          { action: "createInteraction", organizationId, contactEntityId: contact, ...draft },
          { onSuccess: onClose },
        )
      }
    />
  );
}
