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
import { SettingsFooter, SettingsSection } from "@/components/layout/settings-section";
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

function definitionChanged(values: SaveAgentInput, saved: SaveAgentInput) {
  return (
    values.name !== saved.name ||
    values.harness !== saved.harness ||
    (values.model ?? undefined) !== (saved.model ?? undefined) ||
    values.instructions !== saved.instructions
  );
}

export type AgentModelField = {
  id: string;
  harness: HarnessKind;
  model: string | undefined;
  disabled: boolean;
  onChange: (harness: HarnessKind, model: string | undefined) => void;
};

type AgentFormProps = {
  renderModel: (field: AgentModelField) => ReactNode;
  renderStartupInstructions: (draft: { harness: HarnessKind; name: string }) => ReactNode;
  agent?: AgentConfiguration;
  pending: boolean;
  renderCreate?: (editor: FormDialogEditor) => ReactNode;
  onSave: (input: SaveAgentInput, options: { onSuccess: () => void }) => void;
  error?: Error | null;
  onResetError?: () => void;
};

export function AgentForm({
  renderModel,
  renderStartupInstructions,
  agent,
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
        disabledApps: agent.disabledApps,
        substrateGuide: agent.substrateGuide,
      }
    : {
        name: "",
        instructions: "",
        harness: "opencode",
        model: undefined,
        enabled: true,
        disabledApps: [],
        substrateGuide: true,
      };
  const form = useForm({
    defaultValues,
    validationLogic: revalidateLogic({
      mode: agent ? "blur" : "submit",
      modeAfterSubmission: "change",
    }),
    validators: { onDynamic: agentFields },
    onSubmit: ({ value }) => {
      if (pending) return;
      const input = agent
        ? {
            ...value,
            enabled: agent.enabled,
            disabledApps: agent.disabledApps,
            substrateGuide: agent.substrateGuide,
          }
        : value;
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
              [state.values.harness, state.values.name, state.values.substrateGuide] as const
            }
          >
            {([harness, name, guide]) => (
              <form.Field name="instructions">
                {(field) => (
                  <AgentInstructions
                    startupInstructions={renderStartupInstructions({ harness, name })}
                    defaults={guide ?? true}
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
              shouldBlock={({ next }) =>
                next.routeId !== "/_authenticated/_frame/_workspace/agents" ||
                !(next.search.agentId === agent.id && next.search.settings === "overview")
              }
            />
            <SettingsSection title="Agent details">
              <fieldset disabled={busy} className="grid min-w-0 gap-4">
                {nameField}
                <Field>
                  <FieldLabel htmlFor={`${formId}-model`}>Model</FieldLabel>
                  {modelField}
                </Field>
                {instructionsField}
              </fieldset>
              <div className="border-t pt-4">{footer}</div>
            </SettingsSection>
          </div>
        );
      }}
    </form.Subscribe>
  );
}
