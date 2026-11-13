import { queryOptions } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { listContacts, getContact } from "@/api/contacts/requests";

export const contactsOptions = (
  organizationId: string,
  search = "",
  archived = false,
  afterEntityId?: string,
) =>
  queryOptions({
    queryKey: [
      ...queryKeys.contacts(organizationId),
      "list",
      search,
      archived,
      afterEntityId ?? "",
    ],
    queryFn: ({ signal }) =>
      listContacts({
        data: { organizationId, search, archived: archived ? "archived" : "active", afterEntityId },
        signal,
      }),
    retry: false,
  });
export const contactOptions = (organizationId: string, entityId: string) =>
  queryOptions({
    queryKey: [...queryKeys.contacts(organizationId), "record", entityId],
    queryFn: ({ signal }) => getContact({ data: { organizationId, entityId }, signal }),
    retry: false,
  });
