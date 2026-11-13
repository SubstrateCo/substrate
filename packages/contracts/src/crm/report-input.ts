import { organizationId } from "../workspace.ts";
import { z } from "zod";

export const crmReportFilters = z.object({
  asOf: z.iso.datetime().optional(),
  staleDays: z.coerce.number().int().min(1).max(3650).default(30),
  stageId: z.uuid().optional(),
  ownerActorEntityId: z.uuid().optional(),
  currency: z.union([z.string().regex(/^[A-Z]{3}$/), z.literal("unknown")]).optional(),
  outcome: z.enum(["open", "won", "lost"]).optional(),
});
export const crmReportDeals = crmReportFilters
  .extend({
    organizationId,
    cohort: z.enum(["open", "closed", "overdue", "due_today", "no_next_action", "stale"]),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    afterEntityId: z.uuid().optional(),
  })
  .refine(
    (value) => value.cohort !== "closed" || Boolean(value.from && value.to),
    "Closed-deal drilldowns require both period bounds.",
  );
