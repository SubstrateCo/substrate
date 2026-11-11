import { z } from "zod";
export type RoutineDraft = {
  name: string;
  prompt: string;
  cron: string;
  timezone: string;
  enabled: boolean;
};

export type RoutineField = "name" | "prompt" | "cron" | "timezone";
export type RoutineErrors = Partial<Record<RoutineField, string>>;
const messages = {
  name: "Enter a routine name.",
  prompt: "Say what this routine should do.",
  cron: "Use five fields: minute, hour, day, month, and weekday.",
  timezone: "Choose a time zone.",
};

export const routineDraftSchema = z.object({
  name: z.string().trim().min(1, messages.name),
  prompt: z.string().trim().min(1, messages.prompt),
  cron: z
    .string()
    .trim()
    .regex(/^\S+(\s+\S+){4}$/, messages.cron),
  timezone: z.string().refine((zone) => !!zone && knownZone(zone), messages.timezone),
  enabled: z.boolean(),
});

function knownZone(zone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Field errors for a draft, in form order, with the same rules as the routine contract. Empty
 * when the draft can be saved.
 */
export function routineErrors(draft: RoutineDraft): RoutineErrors {
  const errors: RoutineErrors = {};
  const result = routineDraftSchema.safeParse(draft);
  if (!result.success)
    for (const issue of result.error.issues) {
      const field = (["name", "prompt", "cron", "timezone"] as const).find(
        (name) => name === issue.path[0],
      );
      if (field) errors[field] = messages[field];
    }
  return errors;
}
