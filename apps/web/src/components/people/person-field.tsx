import type { PickerPerson } from "@substrate/contracts/people/picker";
import { useId, type ReactNode } from "react";

import { PersonAvatar } from "@/components/people/person-avatar";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxSearch,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";

type Person = Omit<PickerPerson, "email">;

/**
 * A labelled single choice of a workspace person: a field button that opens a searchable list.
 * `value` is the chosen person's id or `""`. `children` go below the description, such as a
 * loading line or an error.
 */
export function PersonField({
  label = "Person",
  people,
  value,
  onChange,
  description,
  empty = "No one else in this workspace.",
  disabled,
  children,
}: {
  label?: string;
  people: readonly Person[];
  value: string;
  onChange: (id: string) => void;
  description?: ReactNode;
  empty?: string;
  disabled?: boolean;
  children?: ReactNode;
}) {
  const id = useId();
  const chosen = people.find((person) => person.id === value) ?? null;
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Combobox
        items={people}
        value={chosen}
        onValueChange={(next) => onChange(next?.id ?? "")}
        isItemEqualToValue={(item, picked) => item.id === picked.id}
        itemToStringLabel={(person) => person.name}
        disabled={disabled}
      >
        <ComboboxTrigger render={<Button id={id} type="button" variant="field" role="combobox" />}>
          {chosen ? (
            <>
              <PersonAvatar size="xs" name={chosen.name} image={chosen.image} />
              <span className="min-w-0 flex-1 truncate text-left">{chosen.name}</span>
            </>
          ) : (
            <span className="text-muted-foreground">Choose a person</span>
          )}
        </ComboboxTrigger>
        <ComboboxContent>
          <ComboboxSearch aria-label="Search people" placeholder="Search people" />
          <ComboboxEmpty>{empty}</ComboboxEmpty>
          <ComboboxList>
            {(person: Person) => (
              <ComboboxItem key={person.id} value={person}>
                <PersonAvatar size="xs" name={person.name} image={person.image} />
                <span className="min-w-0 flex-1 truncate">{person.name}</span>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {description && <FieldDescription>{description}</FieldDescription>}
      {children}
    </Field>
  );
}
