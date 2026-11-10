import { organizationId } from "../workspace";
import { z } from "zod";

const position = z.object({ at: z.iso.datetime({ offset: true }), id: z.uuid() });

export function notificationPosition(value: string) {
  return position.parse(JSON.parse(value));
}

const cursor = z
  .string()
  .max(200)
  .refine((value) => {
    try {
      notificationPosition(value);
      return true;
    } catch {
      return false;
    }
  });
const groupKey = z
  .string()
  .regex(/^(thread|entity):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const page = z.object({
  organizationId,
  after: cursor.optional(),
  limit: z.coerce.number().int().min(1).max(20).default(20),
});

export const notificationGroupsInput = page.extend({
  filter: z.enum(["all", "unread"]).default("all"),
});
export const notificationGroupEventsInput = page.extend({ groupKey });
export const notificationGroupReadInput = z.object({ organizationId, groupKey, through: cursor });
