import { crmWorkspace } from "./input.ts";
import { z } from "zod";

export const crmExport = crmWorkspace.extend({
  kind: z.enum(["accounts", "contacts", "deals"]),
  archived: z.enum(["active", "archived", "all"]).default("active"),
  search: z.string().trim().max(200).optional(),
  format: z.enum(["csv", "json"]).optional(),
});
export type CrmExport = z.output<typeof crmExport>;
export const crmRecordExport = crmExport.extend({ kind: z.enum(["accounts", "deals"]) });
export const contactsExport = crmExport.extend({
  kind: z.literal("contacts").default("contacts"),
});
