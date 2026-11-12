import type { CrmWrite } from "@substrate/contracts/crm/input";

import { actionRow, RowAction, RowActions } from "@/components/layout/row-actions";
import { PersonAvatar } from "@/components/people/person-avatar";
import { FieldDescription } from "@/components/ui/field";
import type { PickerPerson } from "@/lib/people/people-picker";
import { UserMinus } from "lucide-react";

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
    <ul aria-label="Direct access" className="divide-y rounded-lg border">
      {grants.map((grant) => {
        const person = people.find((candidate) => candidate.id === grant.actorEntityId);
        const name = person?.name ?? "Former member";
        return (
          <li
            key={grant.actorEntityId}
            className={`${actionRow} flex items-center gap-3 px-3 py-2`}
          >
            <PersonAvatar name={name} image={person?.image} />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
            <span className="text-xs text-muted-foreground">{levelLabels[grant.level]}</span>
            <RowActions label={`Actions for ${name}`}>
              <RowAction
                label={`Remove ${name}’s access`}
                destructive
                disabled={disabled}
                onClick={() => onRemove({ actorEntityId: grant.actorEntityId, name })}
              >
                <UserMinus aria-hidden="true" />
              </RowAction>
            </RowActions>
          </li>
        );
      })}
    </ul>
  );
}
