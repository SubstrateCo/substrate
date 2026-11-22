import { z } from "zod";

/** The workspace a request acts in. The server checks it against the active session. */
export const organizationId = z.string().min(1).max(200);

/** Paging, search and archive filters for a list of workspace records, such as contacts. */
export const recordListFields = {
  limit: z.coerce.number().int().min(1).max(100).optional(),
  afterEntityId: z.uuid().optional(),
  search: z.string().trim().max(200).optional(),
  archived: z.enum(["active", "archived", "all"]).default("active"),
};
