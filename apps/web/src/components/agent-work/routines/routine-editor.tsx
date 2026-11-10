import { useId, useRef, useState } from "react";

import {
  routineErrors,
  type RoutineDraft,
  type RoutineErrors,
  type RoutineField,
} from "./routine-draft";
import {
  describeSchedule,
  parseSchedule,
  scheduleCron,
  weekdayNames,
  type Frequency,
  type Schedule,
} from "./schedule";
import { TimeZonePicker } from "./time-zone-picker";
import { PendingButton } from "@/components/feedback/pending-button";
import { SegmentedControl } from "@/components/forms/segmented-control";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const fieldOrder: readonly RoutineField[] = ["name", "prompt", "cron", "timezone"];

const frequencies = [
  { value: "daily", label: "Every day" },
  { value: "weekdays", label: "Weekdays" },
  { value: "weekly", label: "Weekly" },
  { value: "custom", label: "Custom" },
] as const satisfies readonly { value: Frequency; label: string }[];

/**
 * Creates or edits a routine in a dialog. Saving creates a revision that runs only after the
 * owner approves it.
 */
export function RoutineEditor({
  agentName,
  editing,
  initial,
  pending,
  error,
  onSave,
  onCancel,
}: {
  agentName: string;
  /** The routine's current name, when editing. */
  editing?: string;
  initial: RoutineDraft;
  pending: boolean;
  /** Reviewed copy for a failed save. */
  error?: string | null;
  onSave: (draft: RoutineDraft) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [draft, setDraft] = useState(initial);
  const [schedule, setSchedule] = useState<Schedule>(() => parseSchedule(initial.cron));
  const [errors, setErrors] = useState<RoutineErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const cron = scheduleCron(schedule);
  const current = { ...draft, cron };
  const set = <K extends keyof RoutineDraft>(key: K, value: RoutineDraft[K]) => {
    const next = { ...current, [key]: value };
    setDraft(next);
    if (submitted) setErrors(routineErrors(next));
  };
  const setScheduleField = (change: Partial<Schedule>) => {
    const next = { ...schedule, ...change };
    setSchedule(next);
    if (submitted) setErrors(routineErrors({ ...current, cron: scheduleCron(next) }));
  };
  const fieldId = (name: RoutineField) => `${id}-${name}`;
  const errorProps = (name: RoutineField, description?: boolean) => ({
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby":
      [description && `${fieldId(name)}-description`, errors[name] && `${fieldId(name)}-error`]
        .filter(Boolean)
        .join(" ") || undefined,
  });
  const fieldError = (name: RoutineField) =>
    errors[name] && (
      <FieldError id={`${fieldId(name)}-error`} errors={[{ message: errors[name] }]} />
    );
  const submit = () => {
    if (pending) return;
    const found = routineErrors(current);
    setSubmitted(true);
    setErrors(found);
    const first = fieldOrder.find((name) => found[name]);
    if (first) {
      formRef.current?.querySelector<HTMLElement>(`#${CSS.escape(fieldId(first))}`)?.focus();
      return;
    }
    onSave(current);
  };
  const summary =
    schedule.frequency === "custom" ? null : `${describeSchedule(cron)}, ${draft.timezone} time.`;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onCancel();
      }}
    >
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${editing}` : "New routine"}</DialogTitle>
          <DialogDescription>
            {agentName} runs it on its desktop and posts in your direct message with it. Each saved
            change needs your approval before it runs.
          </DialogDescription>
        </DialogHeader>
        <form
          ref={formRef}
          aria-label="Routine"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <DialogBody>
            <fieldset disabled={pending} className="grid min-w-0 gap-5">
              <Field data-invalid={!!errors.name}>
                <FieldLabel htmlFor={fieldId("name")}>Name</FieldLabel>
                <Input
                  id={fieldId("name")}
                  placeholder="For example: Weekly design digest"
                  maxLength={200}
                  value={draft.name}
                  onChange={(event) => set("name", event.target.value)}
                  {...errorProps("name")}
                />
                {fieldError("name")}
              </Field>
              <Field data-invalid={!!errors.prompt}>
                <FieldLabel htmlFor={fieldId("prompt")}>What should it do?</FieldLabel>
                <Textarea
                  id={fieldId("prompt")}
                  rows={4}
                  maxLength={20_000}
                  placeholder="For example: Summarize open design-review threads and list the top issues."
                  value={draft.prompt}
                  onChange={(event) => set("prompt", event.target.value)}
                  {...errorProps("prompt")}
                />
                {fieldError("prompt")}
              </Field>
              <div role="group" aria-labelledby={`${id}-schedule`} className="grid gap-3">
                <div className="grid gap-1">
                  <p id={`${id}-schedule`} className="text-sm font-medium">
                    Schedule
                  </p>
                  {summary && (
                    <p className="text-sm text-muted-foreground" aria-live="polite">
                      {summary}
                    </p>
                  )}
                </div>
                <SegmentedControl
                  aria-label="Repeats"
                  value={schedule.frequency}
                  options={frequencies}
                  disabled={pending}
                  onValueChange={(frequency) =>
                    setScheduleField(frequency === "custom" ? { frequency, cron } : { frequency })
                  }
                />
                {schedule.frequency === "custom" ? (
                  <Field data-invalid={!!errors.cron}>
                    <FieldLabel htmlFor={fieldId("cron")}>Cron expression</FieldLabel>
                    <Input
                      id={fieldId("cron")}
                      placeholder="0 9 * * 1-5"
                      maxLength={100}
                      value={schedule.cron}
                      onChange={(event) => setScheduleField({ cron: event.target.value })}
                      {...errorProps("cron", true)}
                    />
                    {fieldError("cron")}
                    <FieldDescription id={`${fieldId("cron")}-description`}>
                      Five fields: minute, hour, day of month, month, and weekday.
                    </FieldDescription>
                  </Field>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {schedule.frequency === "weekly" && (
                      <Field>
                        <FieldLabel htmlFor={`${id}-weekday`}>On</FieldLabel>
                        <Select
                          value={String(schedule.weekday)}
                          onValueChange={(value) => setScheduleField({ weekday: Number(value) })}
                        >
                          <SelectTrigger id={`${id}-weekday`} className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {weekdayNames.map((day, index) => (
                              <SelectItem key={day} value={String(index)}>
                                {day}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    )}
                    <Field>
                      <FieldLabel htmlFor={`${id}-time`}>At</FieldLabel>
                      <Input
                        id={`${id}-time`}
                        type="time"
                        required
                        value={schedule.time}
                        onChange={(event) =>
                          event.target.value && setScheduleField({ time: event.target.value })
                        }
                      />
                    </Field>
                  </div>
                )}
              </div>
              <Field data-invalid={!!errors.timezone}>
                <FieldLabel htmlFor={fieldId("timezone")}>Time zone</FieldLabel>
                <TimeZonePicker
                  id={fieldId("timezone")}
                  value={draft.timezone}
                  invalid={!!errors.timezone}
                  describedBy={errors.timezone && `${fieldId("timezone")}-error`}
                  disabled={pending}
                  onChange={(zone) => set("timezone", zone)}
                />
                {fieldError("timezone")}
              </Field>
              <Field orientation="horizontal" className="items-center">
                <FieldContent>
                  <FieldLabel htmlFor={`${id}-enabled`}>Active</FieldLabel>
                  <FieldDescription>
                    Paused routines keep their settings but don’t run.
                  </FieldDescription>
                </FieldContent>
                <Switch
                  id={`${id}-enabled`}
                  checked={draft.enabled}
                  onCheckedChange={(checked) => set("enabled", checked)}
                />
              </Field>
            </fieldset>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
              Cancel
            </Button>
            <PendingButton type="submit" pending={pending} pendingLabel="Saving…">
              Save routine
            </PendingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
