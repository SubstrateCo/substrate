import { queryOptions } from "@tanstack/react-query";

import type { PickerPerson } from "@/lib/people/people-picker";
import { organizationQueryOptions } from "@/queries/organizations/options";

/**
 * Members of the workspace as people to choose, sorted by name. It reuses the organization
 * detail that Better Auth returns only to members, so it adds no new access.
 */
export const workspacePeopleQueryOptions = (organizationId: string) =>
  queryOptions({
    ...organizationQueryOptions(organizationId),
    select: (organization): PickerPerson[] =>
      organization.members
        .map((member) => ({
          id: member.userId,
          name: member.user.name,
          email: member.user.email,
          image: member.user.image,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
  });
