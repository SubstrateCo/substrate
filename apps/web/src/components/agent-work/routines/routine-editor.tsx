import { routineLimits } from "@substrate/contracts/agent-work";

import { useForm, useSelector } from "@tanstack/react-form";

import { useId, useRef, useState } from "react";

import {
  routineErrors,
  routineDraftSchema,
  type RoutineDraft,
  type RoutineField,
} from "./routine-draft";
import {
  describeSchedule,
  parseSchedule,
  scheduleCron,
  timeOptions,
  weekdayNames,
  type Frequency,
  type Schedule,
} from "./schedule";
import { TimeZonePicker } from "./time-zone-picker";
import { FormDialog } from "@/components/feedback/form-dialog";
import { SegmentedControl } from "@/components/forms/segmented-control";
import { SelectField } from "@/components/forms/select-field";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const fieldOrder: readonly RoutineField[] = ["name", "prompt", "cron", "timezone"];

const frequencies = [
  { value: "daily", label: "Every day" },
  { value: "weekdays", label: "Weekdays" },
  { value: "weekly", label: "Weekly" },
  { value: "custom", label: "Custom" },
] as const satisfies readonly { value: Frequency; label: string }[];

/** Creates or edits a routine in a dialog. A save applies from the next run. */
export function RoutineEditor({
  editing,
  initial,
  pending,
  error,
  onSave,
  onCancel,
  onRestoreFocus,
}: {
  /** The routine's current name, when editing. */
  editing?: string;
  initial: RoutineDraft;
  pending: boolean;
  /** Reviewed copy for a failed save. */
  error?: Error | string | null;
  onSave: (draft: RoutineDraft) => void;
  onCancel: () => void;
  /** Focus the control that opened the editor, because no trigger wraps this dialog. */
  onRestoreFocus: () => void;
}) {
  const id = useId();
  const fieldsRef = useRef<HTMLDivElement>(null);
  const form = useForm({
    defaultValues: initial,
    validators: { onChange: routineDraftSchema, onSubmit: routineDraftSchema },
    onSubmit: ({ value }) => {
      if (!pending) onSave(value);
    },
    onSubmitInvalid: ({ value }) => {
      const found = routineErrors(value);
      const first = fieldOrder.find((name) => found[name]);
      if (first)
        fieldsRef.current?.querySelector<HTMLElement>(`#${CSS.escape(fieldId(first))}`)?.focus();
    },
  });
  const draft = useSelector(form.store, (state) => state.values);
  const submitted = useSelector(form.store, (state) => state.submissionAttempts > 0);
  const [schedule, setSchedule] = useState<Schedule>(() => parseSchedule(initial.cron));
  const errors = submitted ? routineErrors(draft) : {};
  const cron = scheduleCron(schedule);
  const setScheduleField = (change: Partial<Schedule>) => {
    const next = { ...schedule, ...change };
    setSchedule(next);
    form.setFieldValue("cron", scheduleCron(next));
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
  // The time zone is the field right below, so the summary does not repeat it.
  const summary = schedule.frequency === "custom" ? null : `${describeSchedule(cron)}.`;
  return (
    <FormDialog
      title={editing ? `Edit ${editing}` : "New routine"}
      description={null}
      saveLabel={editing ? "Save" : "Create routine"}
      size="lg"
      pending={pending}
      error={error}
      onClose={onCancel}
      onRestoreFocus={onRestoreFocus}
      onSubmit={() => form.handleSubmit()}
    >
      <div ref={fieldsRef} className="contents">
        <Field data-invalid={!!errors.name}>
          <FieldLabel htmlFor={fieldId("name")}>Name</FieldLabel>
          <Input
            id={fieldId("name")}
            placeholder="For example: Weekly design digest"
            maxLength={routineLimits.name}
            value={draft.name}
            onChange={(event) => form.setFieldValue("name", event.target.value)}
            {...errorProps("name")}
          />
          {fieldError("name")}
        </Field>
        <Field data-invalid={!!errors.prompt}>
          <FieldLabel htmlFor={fieldId("prompt")}>What should it do?</FieldLabel>
          <Textarea
            id={fieldId("prompt")}
            rows={4}
            maxLength={routineLimits.prompt}
            placeholder="For example: Summarize open design-review threads and list the top issues."
            value={draft.prompt}
            onChange={(event) => form.setFieldValue("prompt", event.target.value)}
            {...errorProps("prompt")}
          />
          {fieldError("prompt")}
        </Field>
        <FieldSet className="min-w-0">
          <FieldLegend variant="label">Schedule</FieldLegend>
          {summary && <FieldDescription aria-live="polite">{summary}</FieldDescription>}
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
                maxLength={routineLimits.cron}
                value={schedule.cron}
                onChange={(event) => setScheduleField({ cron: event.target.value })}
                {...errorProps("cron", !errors.cron)}
              />
              {fieldError("cron") || (
                <FieldDescription id={`${fieldId("cron")}-description`}>
                  Five fields: minute, hour, day of month, month, and weekday.
                </FieldDescription>
              )}
            </Field>
          ) : null}
          <div
            className={
              schedule.frequency === "weekly"
                ? "grid min-w-0 gap-4 sm:grid-cols-3"
                : "grid min-w-0 gap-4 sm:grid-cols-2"
            }
          >
            {schedule.frequency === "weekly" && (
              <SelectField
                label="On"
                value={String(schedule.weekday)}
                onChange={(value) => setScheduleField({ weekday: Number(value) })}
                options={weekdayNames.map((day, index) => ({ value: String(index), label: day }))}
              />
            )}
            {schedule.frequency !== "custom" && (
              <SelectField
                label="At"
                value={schedule.time}
                onChange={(time) => setScheduleField({ time })}
                options={timeOptions(schedule.time)}
              />
            )}
            <Field data-invalid={!!errors.timezone}>
              <FieldLabel htmlFor={fieldId("timezone")}>Time zone</FieldLabel>
              <TimeZonePicker
                id={fieldId("timezone")}
                value={draft.timezone}
                invalid={!!errors.timezone}
                describedBy={errors.timezone && `${fieldId("timezone")}-error`}
                disabled={pending}
                onChange={(zone) => form.setFieldValue("timezone", zone)}
              />
              {fieldError("timezone")}
            </Field>
          </div>
        </FieldSet>
        <Field orientation="horizontal" className="items-center">
          <FieldContent>
            <FieldLabel htmlFor={`${id}-enabled`}>Active</FieldLabel>
          </FieldContent>
          <Switch
            id={`${id}-enabled`}
            checked={draft.enabled}
            onCheckedChange={(checked) => form.setFieldValue("enabled", checked)}
          />
        </Field>
      </div>
    </FormDialog>
  );
}
