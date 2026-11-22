import { useState } from "react";

import { InteractionEditor } from "@/components/context/interactions/interaction-editor";
import { CustomerPicker } from "@/components/crm/customer-picker";
import { useInteractionMutation } from "@/queries/context/interactions";

export function NewInteraction({
  organizationId,
  contactId,
  onClose,
}: {
  organizationId: string;
  contactId?: string;
  onClose: () => void;
}) {
  const [contact, setContact] = useState(contactId ?? "");
  const mutation = useInteractionMutation(organizationId);
  return (
    <InteractionEditor
      pending={mutation.isPending}
      error={mutation.error}
      canSubmit={!!contact}
      submitLabel="Create interaction"
      contactField={
        <CustomerPicker
          organizationId={organizationId}
          kind="contacts"
          label="Contact"
          value={contact}
          onChange={setContact}
        />
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
