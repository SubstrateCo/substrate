import { queryOptions } from "@tanstack/react-query";

import { getOrganizationPeople } from "@/api/organizations/requests";
import type { PickerPerson } from "@/lib/people/people-picker";
import { queryKeys } from "@/queries/keys";

/** Members of the workspace as people to choose, sorted by name. Only members may read them. */
export const workspacePeopleQueryOptions = (organizationId: string) =>
  queryOptions({
    queryKey: queryKeys.organizationPeople(organizationId),
    queryFn: ({ signal }) => getOrganizationPeople({ data: { organizationId }, signal }),
    staleTime: 30_000,
    retry: false,
    select: (people): PickerPerson[] =>
      people
        .map((person) => ({
          id: person.userId,
          name: person.name,
          email: person.email,
          image: person.image,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
  });
