import { manualMeeting } from "@substrate/contracts/meetings";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useState } from "react";

import { useMeetingsWorkspace } from "../meetings-workspace-context";
import { createMeeting } from "@/api/meetings/requests";
import { formText } from "@/components/auth/form-values";
import { FormDialog } from "@/components/feedback/form-dialog";
import { NativeField } from "@/components/forms/native-form";
import { localTimeZone } from "@/lib/format/date";
import { queryKeys } from "@/queries/keys";

export function NewMeetingDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { scope } = useMeetingsWorkspace();
  const client = useQueryClient();
  const [requestId] = useState(() => crypto.randomUUID());
  const save = useMutation({
    mutationFn: (form: FormData) => {
      const text = (key: string) => formText(form, key);
      const startsAt = text("start"),
        date = new Date(startsAt);
      const offset = -date.getTimezoneOffset(),
        pad = (n: number) => String(n).padStart(2, "0");
      const zone = `${offset >= 0 ? "+" : "-"}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
      const meeting = manualMeeting.parse({
        title: text("title"),
        startsAt: (startsAt.length === 16 ? `${startsAt}:00` : startsAt) + zone,
        durationMs: text("minutes") ? Math.round(Number(text("minutes")) * 60_000) : undefined,
        people: text("people")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        platform: text("platform").trim() || undefined,
        notes: text("notes") || undefined,
        transcript: text("transcript") || undefined,
      });
      return createMeeting(scope, meeting, requestId);
    },
    onSuccess: ({ id }) => {
      void client.invalidateQueries({
        queryKey: queryKeys.meetings(scope.userId, scope.organizationId),
      });
      onCreated(id);
    },
  });
  return (
    <FormDialog
      title="Add meeting"
      description="Save a call to your private archive."
      saveLabel="Save meeting"
      nativeValidation
      pending={save.isPending}
      error={save.error}
      errorDescription="Check the meeting details and try again."
      onSubmit={(form) => save.mutate(form)}
      onClose={onClose}
    >
      <NativeField
        id="meeting-title"
        name="title"
        label="Title"
        required
        missingMessage="Enter a meeting title."
        maxLength={1200}
      />
      <NativeField
        id="meeting-start"
        name="start"
        label="Start date and time"
        type="datetime-local"
        description={`Time zone: ${localTimeZone()}`}
        onInput={({ currentTarget: field }) => {
          if (!(field instanceof HTMLInputElement)) return;
          // datetime-local accepts wall times skipped by a daylight-saving transition.
          const date = new Date(field.value);
          const wallMs = date.getTime() - date.getTimezoneOffset() * 60_000;
          field.setCustomValidity(
            field.value && wallMs !== field.valueAsNumber
              ? "This time does not exist in your time zone. Choose another time."
              : "",
          );
        }}
        required
        missingMessage="Choose the start date and time."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <NativeField
          id="meeting-minutes"
          name="minutes"
          label="Duration (minutes)"
          type="number"
          min={0}
          step="any"
        />
        <NativeField
          id="meeting-platform"
          name="platform"
          label="Meeting app or place"
          maxLength={240}
        />
      </div>
      <NativeField
        id="meeting-people"
        name="people"
        label="People"
        description="Separate names with commas."
      />
      <NativeField id="meeting-notes" name="notes" label="Notes" multiline maxLength={100000} />
      <NativeField
        id="meeting-transcript"
        name="transcript"
        label="Transcript"
        multiline
        maxLength={100000}
      />
    </FormDialog>
  );
}
