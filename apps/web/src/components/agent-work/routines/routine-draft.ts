import { knownTimeZone, routineFields, routineLimits } from "@substrate/contracts/agent-work";

import { z } from "zod";

export type RoutineField = "name" | "prompt" | "cron" | "timezone";
export type RoutineErrors = Partial<Record<RoutineField, string>>;
const messages = {
  name: "Enter a routine name.",
  prompt: "Say what this routine should do.",
  cron: "Use five fields: minute, hour, day, month, and weekday.",
  timezone: "Choose a time zone.",
};
const tooLong = (max: number) => `Use ${max.toLocaleString("en-US")} characters or fewer.`;
const longMessages: Record<RoutineField, string> = {
  name: `Use a routine name of ${routineLimits.name} characters or fewer.`,
  prompt: tooLong(routineLimits.prompt),
  cron: tooLong(routineLimits.cron),
  timezone: messages.timezone,
};

export const routineDraftSchema = z
  .object(routineFields)
  .omit({ destination: true })
  .extend({
    name: z.string().trim().min(1, messages.name).max(routineLimits.name, longMessages.name),
    prompt: z
      .string()
      .trim()
      .min(1, messages.prompt)
      .max(routineLimits.prompt, longMessages.prompt),
    cron: z
      .string()
      .trim()
      .max(routineLimits.cron, longMessages.cron)
      .regex(/^\S+(\s+\S+){4}$/, messages.cron),
    timezone: z
      .string()
      .max(routineLimits.timezone, messages.timezone)
      .refine((zone) => !!zone && knownTimeZone(zone), messages.timezone),
  });

export type RoutineDraft = z.input<typeof routineDraftSchema>;

export function routineErrors(draft: RoutineDraft): RoutineErrors {
  const errors: RoutineErrors = {};
  const result = routineDraftSchema.safeParse(draft);
  if (!result.success)
    for (const issue of result.error.issues) {
      const field = (["name", "prompt", "cron", "timezone"] as const).find(
        (name) => name === issue.path[0],
      );
      if (field && !errors[field])
        errors[field] = issue.code === "too_big" ? longMessages[field] : messages[field];
    }
  return errors;
}
