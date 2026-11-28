import type { PickerPerson } from "@substrate/contracts/people/picker";

import { queryOptions } from "@tanstack/react-query";

import { getOrganizationPeople } from "@/api/organizations/requests";
import { queryKeys } from "@/queries/keys";

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
