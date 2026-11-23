import { utcTimestamp } from "../timestamps.ts";
import { organizationId } from "../workspace.ts";
import { z } from "zod";

export const crmReportFilters = z.object({
  asOf: utcTimestamp.optional(),
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
    from: utcTimestamp.optional(),
    to: utcTimestamp.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    afterEntityId: z.uuid().optional(),
  })
  .refine(
    (value) => value.cohort !== "closed" || Boolean(value.from && value.to),
    "Closed-deal drilldowns require both period bounds.",
  );
