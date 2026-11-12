import { queryOptions } from "@tanstack/react-query";

import { getCrmGrants, getCrmPeople } from "@/api/crm/management";
import { queryKeys } from "@/queries/keys";

export const crmPeopleOptions = (organizationId: string) =>
  queryOptions({
    queryKey: [...queryKeys.crm(organizationId), "management", "people"],
    queryFn: ({ signal }) => getCrmPeople({ data: { organizationId }, signal }),
    retry: false,
  });

export const crmGrantsOptions = (organizationId: string, entityId: string) =>
  queryOptions({
    queryKey: [...queryKeys.crm(organizationId), "management", "grants", entityId],
    queryFn: ({ signal }) => getCrmGrants({ data: { organizationId, entityId }, signal }),
    retry: false,
  });
