export type RoutineDraft = {
  name: string;
  prompt: string;
  cron: string;
  timezone: string;
  enabled: boolean;
};

export type RoutineField = "name" | "prompt" | "cron" | "timezone";
export type RoutineErrors = Partial<Record<RoutineField, string>>;

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
  if (!draft.name.trim()) errors.name = "Enter a routine name.";
  if (!draft.prompt.trim()) errors.prompt = "Say what this routine should do.";
  if (!/^\S+(\s+\S+){4}$/.test(draft.cron.trim()))
    errors.cron = "Use five fields: minute, hour, day, month, and weekday.";
  if (!draft.timezone || !knownZone(draft.timezone)) errors.timezone = "Choose a time zone.";
  return errors;
}
