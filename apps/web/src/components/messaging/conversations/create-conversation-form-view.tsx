import { useForm } from "@tanstack/react-form";

import { useEffect, useRef, type ReactNode } from "react";

import { FormMessage } from "../../auth/form-message";
import { PendingButton } from "../../feedback/pending-button";
import { Button } from "../../ui/button";
import { Checkbox } from "../../ui/checkbox";
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "../../ui/field";
import { Input } from "../../ui/input";
import { createConversationDraftSchema } from "./create-conversation-validation";
import type { Conversation } from "@/lib/messaging/conversations";

export type ConversationDraft = { name: string; emails: string; isPrivate: boolean };

export function CreateConversationForm({
  kind,
  onSubmit,
  onCancel,
  pending = false,
  error,
  children,
}: {
  kind: Conversation["kind"];
  onSubmit: (draft: ConversationDraft) => void;
  onCancel: () => void;
  pending?: boolean;
  error?: Error | null;
  children?: ReactNode;
}) {
  const schema = createConversationDraftSchema(kind);
  const form = useForm({
    defaultValues: { name: "", emails: "", isPrivate: false },
    validators: { onChange: schema, onBlur: schema, onSubmit: schema },
    onSubmit: ({ value }) => {
      if (!pending) onSubmit(value);
    },
  });
  const formElement = useRef<HTMLFormElement>(null);
  useEffect(() => {
    formElement.current?.querySelector("input")?.focus();
  }, []);
  const title = {
    channel: "Create a channel",
    dm: "New direct message",
    group: "New group message",
  }[kind];
  return (
    <section className="m-auto w-full max-w-xl shrink-0 p-6 sm:p-10">
      <h2 className="mb-7 text-xl font-semibold tracking-tight">{title}</h2>
      <form.Subscribe selector={(state) => [state.isSubmitting, state.submissionAttempts] as const}>
        {([isSubmitting, submissionAttempts]) => (
          <form
            noValidate
            ref={formElement}
            className="space-y-5"
            onKeyDown={(event) => {
              if (
                event.key === "Escape" &&
                !event.defaultPrevented &&
                !event.nativeEvent.isComposing &&
                !pending &&
                !isSubmitting
              ) {
                event.preventDefault();
                onCancel();
              }
            }}
            onSubmit={(event) => {
              event.preventDefault();
              if (pending || isSubmitting) return;
              void form.handleSubmit();
            }}
          >
            {kind !== "dm" && (
              <form.Field name="name">
                {(field) => {
                  const invalid =
                    (field.state.meta.isBlurred || submissionAttempts > 0) &&
                    !field.state.meta.isValid;
                  return (
                    <Field data-invalid={invalid}>
                      <FieldLabel htmlFor="conversation-name">
                        {kind === "channel" ? "Channel name" : "Group name (optional)"}
                      </FieldLabel>
                      <Input
                        id="conversation-name"
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                        onBlur={field.handleBlur}
                        aria-invalid={invalid}
                        aria-describedby={invalid ? "conversation-name-error" : undefined}
                        placeholder={
                          kind === "channel" ? "e.g. product-updates" : "e.g. Launch team"
                        }
                        maxLength={80}
                        disabled={pending || isSubmitting}
                        required={kind === "channel"}
                      />
                      {invalid && (
                        <FieldError id="conversation-name-error" errors={field.state.meta.errors} />
                      )}
                    </Field>
                  );
                }}
              </form.Field>
            )}
            <form.Field name="emails">
              {(field) => {
                const invalid =
                  (field.state.meta.isBlurred || submissionAttempts > 0) &&
                  !field.state.meta.isValid;
                return (
                  <Field data-invalid={invalid}>
                    <FieldLabel htmlFor="recipient-emails">
                      {kind === "channel" ? "Add people (optional)" : "To"}
                    </FieldLabel>
                    <Input
                      id="recipient-emails"
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                      onBlur={field.handleBlur}
                      placeholder="alex@company.com, sam@partner.com"
                      disabled={pending || isSubmitting}
                      required={kind !== "channel"}
                      aria-invalid={invalid}
                      aria-describedby={`recipient-help${invalid ? " recipient-emails-error" : ""}`}
                    />
                    {invalid && (
                      <FieldError id="recipient-emails-error" errors={field.state.meta.errors} />
                    )}
                    <FieldDescription id="recipient-help">
                      Enter exact email addresses, separated by commas. People in other workspaces
                      can be included. They must already have an account.
                    </FieldDescription>
                  </Field>
                );
              }}
            </form.Field>
            {children}
            {kind === "channel" && (
              <form.Field name="isPrivate">
                {(field) => {
                  const invalid =
                    (field.state.meta.isBlurred || submissionAttempts > 0) &&
                    !field.state.meta.isValid;
                  return (
                    <Field orientation="horizontal" data-invalid={invalid}>
                      <Checkbox
                        id="conversation-private"
                        checked={field.state.value}
                        onCheckedChange={(checked) => field.handleChange(checked === true)}
                        onBlur={field.handleBlur}
                        disabled={pending || isSubmitting}
                        aria-invalid={invalid}
                        aria-describedby={invalid ? "conversation-private-error" : undefined}
                      />
                      <FieldContent>
                        <FieldLabel htmlFor="conversation-private">
                          Make this channel private
                        </FieldLabel>
                        {invalid && (
                          <FieldError
                            id="conversation-private-error"
                            errors={field.state.meta.errors}
                          />
                        )}
                      </FieldContent>
                    </Field>
                  );
                }}
              </form.Field>
            )}
            <FormMessage
              error={error}
              errorDescription="We couldn’t create this conversation. Check the recipients and try again."
            />
            <div className="flex flex-wrap gap-2">
              <PendingButton
                type="submit"
                className="min-w-36"
                pending={pending || isSubmitting}
                pendingLabel="Creating…"
              >
                {kind === "channel" ? "Create channel" : "Start conversation"}
              </PendingButton>
              <Button
                type="button"
                variant="outline"
                disabled={pending || isSubmitting}
                onClick={onCancel}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </form.Subscribe>
    </section>
  );
}
