import { z } from "zod";

/** The workspace a request acts in. The server checks it against the active session. */
export const organizationId = z.string().min(1).max(200);

/** The account and workspace a private view expects. Neither field grants access. */
export const userWorkspace = z.object({ userId: z.string().min(1).max(200), organizationId });

/** Paging, search and archive filters for a list of workspace records, such as contacts. */
export const recordListFields = {
  limit: z.coerce.number().int().min(1).max(100).optional(),
  afterEntityId: z.uuid().optional(),
  search: z.string().trim().max(200).optional(),
  archived: z.enum(["active", "archived", "all"]).default("active"),
};
