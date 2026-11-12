import { crmWorkspace } from "./input.js";
import { z } from "zod";

export const CRM_EXPORT_MAX_ROWS = 1000;
export const crmExport = crmWorkspace.extend({
  kind: z.enum(["accounts", "contacts", "deals"]),
  archived: z.enum(["active", "archived", "all"]).default("active"),
  search: z.string().trim().max(200).optional(),
});
export type CrmExport = z.output<typeof crmExport>;
