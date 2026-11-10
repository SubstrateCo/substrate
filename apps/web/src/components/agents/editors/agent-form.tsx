import type { AgentConfiguration, SaveAgentInput } from "@startup-os/contracts/agents";
import { saveAgentInput } from "@startup-os/contracts/agents";
import type { HarnessKind } from "@startup-os/contracts/harness";

import { revalidateLogic, useForm } from "@tanstack/react-form";

import { useId, useState, type ReactNode } from "react";

import { HarnessAvailability } from "../model-picker/harness-availability";
import { ModelPicker } from "../model-picker/model-picker";
import { AgentInstructions } from "./agent-instructions";
import { UnsavedChangesGuard } from "./unsaved-changes-guard";
import type { AgentSettingsSection } from "@/components/agent-work/app/agent-sections";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { PendingButton } from "@/components/feedback/pending-button";
import { FormTextField } from "@/components/forms/form-text-field";
import {
  GroupTitle,
  SettingsCard,
  SettingsFooter,
  SettingsSection,
} from "@/components/layout/settings-section";
import { Button } from "@/components/ui/button";
import { DialogBody, DialogFooter } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { z } from "zod";

const agentFields = saveAgentInput.extend({
  name: z
    .string()
    .trim()
    .min(1, "Enter an agent name.")
    .max(200, "Use an agent name of 200 characters or fewer."),
});

export type AgentSection = "skills" | "mcps";

type AgentFormProps = {
  userId: string;
  organizationId?: string | null;
  agent?: AgentConfiguration;
  /** The settings section to show for an existing agent. */
  section?: AgentSettingsSection;
  onSectionChange?: (section: AgentSettingsSection) => void;
  picture?: ReactNode;
  runSettings?: ReactNode;
  deleteAction?: ReactNode;
  pending: boolean;
  onCancel?: () => void;
  onSave: (input: SaveAgentInput) => Promise<void>;
  renderConfiguration: (
    harness: HarnessKind,
    section: AgentSection,
    defaults: boolean,
    agentId?: string,
  ) => ReactNode;
};

/**
 * Create mode is a short dialog. Edit mode shows one settings section; name, model, and
 * instructions share one draft across sections, and leaving the settings with a draft asks first.
 */
export function AgentForm({
  userId,
  organizationId,
  agent,
  section = "general",
  onSectionChange,
  picture,
  runSettings,
  deleteAction,
  pending,
  onCancel,
  onSave,
  renderConfiguration,
}: AgentFormProps) {
  const [error, setError] = useState<string>();
  const formId = useId();
  const defaultValues: SaveAgentInput = agent
    ? {
        id: agent.id,
        name: agent.name,
        instructions: agent.instructions,
        harness: agent.harness,
        model: agent.model,
        enabled: agent.enabled,
        useStartupDefaults: agent.useStartupDefaults,
      }
    : {
        name: "",
        instructions: "",
        harness: "opencode",
        model: undefined,
        enabled: true,
        useStartupDefaults: true,
      };
  const form = useForm({
    defaultValues,
    // A new agent's empty name is not an error until the owner tries to create it.
    validationLogic: revalidateLogic({
      mode: agent ? "blur" : "submit",
      modeAfterSubmission: "change",
    }),
    validators: { onDynamic: agentFields },
    onSubmit: async ({ value }) => {
      if (pending) return;
      setError(undefined);
      try {
        await onSave(agentFields.parse(value));
        form.reset(value);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? actionErrorMessage(cause, "We couldn’t save this agent. Try again.")
            : "We couldn’t save this agent. Try again.",
        );
      }
    },
    onSubmitInvalid: ({ formApi }) => {
      // Show the section that holds the first error.
      if (!formApi.getFieldMeta("name")?.isValid) onSectionChange?.("general");
      else if (!formApi.getFieldMeta("instructions")?.isValid) onSectionChange?.("instructions");
    },
  });
  return (
    <form.Subscribe selector={(state) => [state.isSubmitting, state.isDirty] as const}>
      {([isSubmitting, dirty]) => {
        const busy = pending || isSubmitting;
        const nameField = (
          <form.Field name="name">
            {(field) => (
              <FormTextField
                field={field}
                id={`${formId}-name`}
                label="Agent name"
                fieldClassName="min-w-0"
                form={formId}
                required
                maxLength={200}
                placeholder="For example: Release helper"
              />
            )}
          </form.Field>
        );
        const modelField = (
          <form.Subscribe selector={(state) => [state.values.harness, state.values.model] as const}>
            {([harness, model]) => (
              <div className="grid min-w-0 gap-2">
                <ModelPicker
                  key={`${userId}/${organizationId}`}
                  id={`${formId}-model`}
                  userId={userId}
                  organizationId={organizationId}
                  agentId={agent?.id}
                  harness={harness}
                  model={model}
                  disabled={busy}
                  onChange={(nextHarness, nextModel) => {
                    form.setFieldValue("harness", nextHarness);
                    form.setFieldValue("model", nextModel);
                  }}
                />
                <HarnessAvailability
                  userId={userId}
                  organizationId={organizationId}
                  harness={harness}
                />
              </div>
            )}
          </form.Subscribe>
        );
        const instructionsField = (
          <form.Subscribe
            selector={(state) =>
              [state.values.harness, state.values.name, state.values.useStartupDefaults] as const
            }
          >
            {([harness, name, defaults]) => (
              <form.Field name="instructions">
                {(field) => (
                  <AgentInstructions
                    harness={harness}
                    name={name}
                    agentId={agent?.id}
                    organizationId={organizationId}
                    defaults={defaults ?? true}
                    creating={!agent}
                    value={field.state.value}
                    invalid={!field.state.meta.isValid}
                    errors={field.state.meta.errors}
                    onBlur={field.handleBlur}
                    onChange={(value) => {
                      field.handleChange(value);
                      if (!field.state.meta.isValid) void field.validate("blur");
                    }}
                  />
                )}
              </form.Field>
            )}
          </form.Subscribe>
        );
        const footerWith = (unsaved: string) => (
          <SettingsFooter
            status={
              error ? (
                <p role="alert" className="text-destructive">
                  {error}
                </p>
              ) : (
                agent && dirty && <p className="text-muted-foreground">{unsaved}</p>
              )
            }
          >
            <Button
              type="button"
              variant="outline"
              disabled={busy || (!onCancel && !dirty)}
              onClick={() => {
                if (onCancel) onCancel();
                else {
                  form.reset();
                  setError(undefined);
                }
              }}
            >
              {onCancel ? "Cancel" : "Discard changes"}
            </Button>
            <PendingButton
              type="submit"
              form={formId}
              pending={busy}
              disabled={!!agent && !dirty}
              pendingLabel={agent ? "Saving…" : "Creating…"}
            >
              {agent ? "Save changes" : "Create agent"}
            </PendingButton>
          </SettingsFooter>
        );
        const footer = footerWith("You have unsaved changes.");
        const formElement = (
          <form
            id={formId}
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              if (!busy) void form.handleSubmit();
            }}
          />
        );

        if (!agent)
          // Creation runs in a dialog: the fields scroll and the footer stays in view.
          return (
            <>
              {formElement}
              <DialogBody>
                <fieldset disabled={busy} className="grid min-w-0 gap-5">
                  {nameField}
                  <Field>
                    <FieldLabel htmlFor={`${formId}-model`}>Model</FieldLabel>
                    <FieldDescription>
                      The model it thinks with. Leave the default if you’re not sure.
                    </FieldDescription>
                    {modelField}
                  </Field>
                  {instructionsField}
                </fieldset>
              </DialogBody>
              <DialogFooter>{footer}</DialogFooter>
            </>
          );

        // General and Instructions save in their card footer. Other sections show the draft
        // in a bar so it stays visible while the owner looks around.
        const draftBar = dirty && section !== "general" && section !== "instructions" && (
          <div
            role="region"
            aria-label="Unsaved agent changes"
            className="sticky bottom-0 z-10 mt-6 rounded-xl border bg-card px-5 py-3 shadow-sm"
          >
            {footerWith("Unsaved changes to the name, model, or instructions.")}
          </div>
        );
        return (
          <div className="min-w-0">
            {formElement}
            <UnsavedChangesGuard dirty={dirty} agentId={agent.id} />
            {section === "general" && (
              <SettingsSection
                title="General"
                description="How this agent appears in Startup OS and which model it uses."
              >
                <SettingsCard label="Agent details" footer={footer}>
                  <fieldset
                    disabled={busy}
                    className="grid min-w-0 gap-x-8 gap-y-8 @2xl/content:grid-cols-2"
                  >
                    <section aria-label="Profile" className="grid min-w-0 content-start gap-4">
                      <GroupTitle title="Profile" />
                      {nameField}
                      {picture}
                    </section>
                    <section
                      aria-label="Model"
                      className="grid min-w-0 content-start gap-4 @2xl/content:border-l @2xl/content:pl-8"
                    >
                      <GroupTitle
                        title="Model"
                        description="It runs on this agent’s desktop with the tools installed there."
                      />
                      {modelField}
                    </section>
                  </fieldset>
                </SettingsCard>
                {deleteAction}
              </SettingsSection>
            )}
            {section === "instructions" && (
              <SettingsSection
                title="Instructions"
                description="Tell this agent its role, tone, and limits."
              >
                <SettingsCard label="Agent instructions" footer={footer}>
                  <fieldset disabled={busy} className="min-w-0">
                    {instructionsField}
                  </fieldset>
                </SettingsCard>
              </SettingsSection>
            )}
            {(section === "skills" || section === "mcps") && (
              <form.Subscribe
                selector={(state) =>
                  [state.values.harness, state.values.useStartupDefaults] as const
                }
              >
                {([harness, defaults]) =>
                  renderConfiguration(harness, section, defaults ?? true, agent.id)
                }
              </form.Subscribe>
            )}
            {section === "run" && runSettings}
            {draftBar}
          </div>
        );
      }}
    </form.Subscribe>
  );
}
