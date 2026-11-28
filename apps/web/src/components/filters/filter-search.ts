import type { FilterField } from "./types";

export function matchingFilterOptions<Id extends string>(
  fields: readonly FilterField<Id>[],
  query: string,
) {
  const search = query.trim().toLocaleLowerCase();
  if (!search) return [];
  return fields.flatMap((field) =>
    field.kind === "option"
      ? field.options
          .filter((option) =>
            [field.label, option.label, option.group ?? ""]
              .join(" ")
              .toLocaleLowerCase()
              .includes(search),
          )
          .map((option) => ({ field, option }))
      : [],
  );
}
