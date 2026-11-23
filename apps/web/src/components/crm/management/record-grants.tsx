import type { CrmWrite } from "@substrate/contracts/crm/input";

import { recordRows } from "@/components/layout/record-section";
import { AccessRow } from "@/components/people/access-row";
import { FieldDescription } from "@/components/ui/field";
import type { PickerPerson } from "@/lib/people/people-picker";

type Level = Extract<CrmWrite, { action: "share" }>["level"];
const levelLabels: Record<Level, string> = {
  view: "Can view",
  comment: "Can comment",
  edit: "Can edit",
  owner: "Can manage access",
};

export function RecordGrants({
  grants,
  people,
  disabled,
  onRemove,
}: {
  grants: readonly { actorEntityId: string; level: Level }[];
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
            level={levelLabels[grant.level]}
            disabled={disabled}
            onRemove={() => onRemove({ actorEntityId: grant.actorEntityId, name })}
          />
        );
      })}
    </ul>
  );
}
