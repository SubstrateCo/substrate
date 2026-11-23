import { utcTimestamp } from "../timestamps.ts";
import { organizationId } from "../workspace.ts";
import { z } from "zod";

// Routes name the record in the path; bodies and queries carry the workspace.
export const calendarWorkspace = z.object({ organizationId });
export const providerCalendarList = calendarWorkspace.extend({
  credentialAccountId: z.string().min(1).max(200),
});
export const calendarConnect = providerCalendarList.extend({
  providerCalendarIds: z.array(z.string().min(1).max(1024)).min(1).max(50),
});
export const calendarUpdate = calendarWorkspace
  .extend({
    recordsInteractions: z.boolean().optional(),
    paused: z.boolean().optional(),
  })
  .refine(
    (input) => input.recordsInteractions !== undefined || input.paused !== undefined,
    "Change at least one setting.",
  );

export const calendarEventRange = calendarWorkspace
  .extend({
    from: utcTimestamp,
    until: utcTimestamp,
    calendarEntityIds: z
      .union([z.uuid(), z.array(z.uuid()).max(50)])
      .transform((value) => (Array.isArray(value) ? value : [value]))
      .optional(),
  })
  .refine(({ from, until }) => {
    const duration = Date.parse(until) - Date.parse(from);
    return duration > 0 && duration <= 42 * 86_400_000;
  }, "Choose a period of at most 42 days.");
export const contactMeetings = calendarWorkspace.extend({
  limit: z.coerce.number().int().min(1).max(50).optional(),
});
export const interactionSourceEvents = calendarWorkspace.extend({
  interactionEntityIds: z.array(z.uuid()).min(1).max(100),
});

export const providerAccountParams = providerCalendarList.pick({ credentialAccountId: true });
export const calendarParams = z.object({ calendarEntityId: z.uuid() });
export const calendarEventParams = z.object({ entityId: z.uuid() });
export const contactParams = z.object({ contactEntityId: z.uuid() });

export type CalendarConnectInput = z.output<typeof calendarConnect>;
export type CalendarUpdateInput = z.output<typeof calendarUpdate> & z.output<typeof calendarParams>;
export type CalendarEventRangeInput = z.output<typeof calendarEventRange>;
export type ContactMeetingsInput = z.output<typeof contactMeetings> &
  z.output<typeof contactParams>;
