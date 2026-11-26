import { crmAccessLabels } from "@substrate/contracts/access/levels";
import type { PickerPerson } from "@substrate/contracts/people/picker";
import type { PermissionLevel } from "@substrate/contracts/tasks";

import { recordRows } from "@/components/layout/record-section";
import { AccessRow } from "@/components/people/access-row";
import { FieldDescription } from "@/components/ui/field";

export function RecordGrants({
  grants,
  people,
  disabled,
  onRemove,
}: {
  grants: readonly { actorEntityId: string; level: PermissionLevel }[];
  people: readonly PickerPerson[];
  disabled: boolean;
  onRemove: (person: { actorEntityId: string; name: string }) => void;
}) {
  if (grants.length === 0)
    return (
      <FieldDescription>
        No workspace people have direct access grants. Organization owners and admins still have
        access.
      </FieldDescription>
    );
  return (
    <ul aria-label="Direct access" className={recordRows}>
      {grants.map((grant) => {
        const person = people.find((candidate) => candidate.id === grant.actorEntityId);
        const name = person?.name ?? "Former member";
        return (
          <AccessRow
            key={grant.actorEntityId}
            name={name}
            image={person?.image}
            level={crmAccessLabels[grant.level]}
            disabled={disabled}
            onRemove={() => onRemove({ actorEntityId: grant.actorEntityId, name })}
          />
        );
      })}
    </ul>
  );
}
