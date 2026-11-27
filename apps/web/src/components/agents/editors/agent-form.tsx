import type { AgentConfiguration, SaveAgentInput } from "@substrate/contracts/agents";
import { saveAgentInput } from "@substrate/contracts/agents";
import type { HarnessKind } from "@substrate/contracts/harness-runtime";

import { revalidateLogic, useForm } from "@tanstack/react-form";

import { useId, type ReactNode } from "react";

import { AgentInstructions } from "./agent-instructions";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import type { FormDialogEditor } from "@/components/feedback/form-dialog";
import { UnsavedChangesGuard } from "@/components/feedback/unsaved-changes-guard";
import { FormTextField } from "@/components/forms/form-text-field";
import { SettingsCard, SettingsFooter } from "@/components/layout/settings-section";
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

/**
 * Whether the name, model, or instructions differ from the saved agent. Enabled is not part of the
 * draft: its switch saves at once in "When it runs".
 */
function definitionChanged(values: SaveAgentInput, saved: SaveAgentInput) {
  return (
    values.name !== saved.name ||
    values.harness !== saved.harness ||
    (values.model ?? undefined) !== (saved.model ?? undefined) ||
    values.instructions !== saved.instructions
  );
}

/** The draft's runtime and model, for the model field the settings compose. */
export type AgentModelField = {
  id: string;
  harness: HarnessKind;
  model: string | undefined;
  disabled: boolean;
  onChange: (harness: HarnessKind, model: string | undefined) => void;
};

type AgentFormProps = {
  /** Renders the model field for the draft's runtime and model. */
  renderModel: (field: AgentModelField) => ReactNode;
  /** Renders the built-in rules preview for the draft's runtime and name. */
  renderStartupInstructions: (draft: { harness: HarnessKind; name: string }) => ReactNode;
  agent?: AgentConfiguration;
  picture?: ReactNode;
  pending: boolean;
  renderCreate?: (editor: FormDialogEditor) => ReactNode;
  /** Starts the save mutation. Call `onSuccess` once the agent is stored. */
  onSave: (input: SaveAgentInput, options: { onSuccess: () => void }) => void;
  /** The save mutation's error. */
  error?: Error | null;
  /** Clears the save mutation's error. */
  onResetError?: () => void;
};

/**
 * Create mode is a short dialog. Edit mode is one card with the name, model, and instructions in
 * one draft; leaving the settings overview with a draft asks first.
 */
export function AgentForm({
  renderModel,
  renderStartupInstructions,
  agent,
  picture,
  pending,
  renderCreate,
  onSave,
  error: saveError,
  onResetError,
}: AgentFormProps) {
  const error = saveError
    ? actionErrorMessage(saveError, "We couldn’t save this agent. Try again.")
    : undefined;
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
    onSubmit: ({ value }) => {
      if (pending) return;
      // The saved agent owns enabled; its own switch may have changed it since the draft began.
      const input = agent ? { ...value, enabled: agent.enabled } : value;
      onSave(agentFields.parse(input), { onSuccess: () => form.reset(input) });
    },
  });
  return (
    <form.Subscribe
      selector={(state) =>
        [state.isSubmitting, !!agent && definitionChanged(state.values, defaultValues)] as const
      }
    >
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
                {renderModel({
                  id: `${formId}-model`,
                  harness,
                  model,
                  disabled: busy,
                  onChange: (nextHarness, nextModel) => {
                    form.setFieldValue("harness", nextHarness);
                    form.setFieldValue("model", nextModel);
                  },
                })}
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
                    startupInstructions={renderStartupInstructions({ harness, name })}
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
        const footer = (
          <SettingsFooter
            dirty={dirty}
            pending={busy}
            error={error}
            form={formId}
            onDiscard={() => {
              form.reset();
              onResetError?.();
            }}
          />
        );
        const submit = () => {
          if (!busy) return form.handleSubmit();
        };

        if (!agent)
          return renderCreate?.({
            formId,
            pending: busy,
            error,
            onSubmit: submit,
            fields: (
              <>
                {nameField}
                <Field>
                  <FieldLabel htmlFor={`${formId}-model`}>Model</FieldLabel>
                  {modelField}
                  <FieldDescription>
                    The model it thinks with. Leave the default if you’re not sure.
                  </FieldDescription>
                </Field>
                {instructionsField}
              </>
            ),
          });

        return (
          <div className="min-w-0">
            <form
              id={formId}
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            />
            <UnsavedChangesGuard
              dirty={dirty}
              description="Your changes to this agent’s name, model, or instructions aren’t saved."
              name={`Agent settings: ${agent.name}`}
              // Moving the view or a thread under the open overview keeps the draft.
              shouldBlock={({ next }) =>
                next.routeId !== "/_authenticated/_frame/_workspace/agents" ||
                !(next.search.agentId === agent.id && next.search.settings === "overview")
              }
            />
            <SettingsCard label="Agent details" footer={footer}>
              <fieldset disabled={busy} className="grid min-w-0 gap-6">
                <div className="grid min-w-0 gap-4">
                  {nameField}
                  {picture}
                </div>
                <Field>
                  <FieldLabel htmlFor={`${formId}-model`}>Model</FieldLabel>
                  {modelField}
                  <FieldDescription>
                    It runs on this agent’s desktop with the tools installed there.
                  </FieldDescription>
                </Field>
                {instructionsField}
              </fieldset>
            </SettingsCard>
          </div>
        );
      }}
    </form.Subscribe>
  );
}
