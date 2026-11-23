import type { AgentConfiguration, SaveAgentInput } from "@substrate/contracts/agents";
import { saveAgentInput } from "@substrate/contracts/agents";
import type { HarnessKind } from "@substrate/contracts/harness";

import { revalidateLogic, useForm } from "@tanstack/react-form";

import { useId, type ReactNode } from "react";

import { HarnessAvailability } from "../model-picker/harness-availability";
import { ModelPicker } from "../model-picker/model-picker";
import { HarnessAccount } from "../sign-in/harness-account";
import { AgentInstructions } from "./agent-instructions";
import { GeneralSettingsLayout, InstructionsSettingsLayout } from "./agent-settings-layout";
import { UnsavedSectionsBar } from "./unsaved-sections-bar";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import type { FormDialogEditor } from "@/components/feedback/form-dialog";
import { UnsavedChangesGuard } from "@/components/feedback/unsaved-changes-guard";
import {
  RegisterDraft,
  useDiscardDrafts,
  useDraftKeys,
} from "@/components/feedback/unsaved-drafts";
import { FormTextField } from "@/components/forms/form-text-field";
import { SettingsFooter } from "@/components/layout/settings-section";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import {
  agentSettingsSections,
  isAgentSettingsSection,
  listSections,
  type AgentSettingsSection,
} from "@/lib/agent-work/agent-sections";
import { z } from "zod";

const agentFields = saveAgentInput.extend({
  name: z
    .string()
    .trim()
    .min(1, "Enter an agent name.")
    .max(200, "Use an agent name of 200 characters or fewer."),
});

export type AgentSection = "skills" | "mcps";

/** Whether general and instructions differ from the saved agent. */
function definitionChanges(values: SaveAgentInput, saved: SaveAgentInput) {
  return [
    values.name !== saved.name ||
      values.enabled !== saved.enabled ||
      values.harness !== saved.harness ||
      (values.model ?? undefined) !== (saved.model ?? undefined),
    values.instructions !== saved.instructions,
  ] as const;
}

type AgentFormProps = {
  userId: string;
  organizationId?: string | null;
  agent?: AgentConfiguration;
  /** The settings section to show for an existing agent. */
  section?: AgentSettingsSection;
  onSectionChange?: (section: AgentSettingsSection) => void;
  picture?: ReactNode;
  /** Keeps its own draft, registered under "run". */
  runSettings?: ReactNode;
  deleteAction?: ReactNode;
  pending: boolean;
  renderCreate?: (editor: FormDialogEditor) => ReactNode;
  /** Starts the save mutation. Call `onSuccess` once the agent is stored. */
  onSave: (input: SaveAgentInput, options: { onSuccess: () => void }) => void;
  /** The save mutation's error. */
  error?: Error | null;
  /** Clears the save mutation's error. */
  onResetError?: () => void;
  renderConfiguration: (props: {
    harness: HarnessKind;
    section: AgentSection;
    defaults: boolean;
    agentId?: string;
  }) => ReactNode;
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
  renderCreate,
  onSave,
  error: saveError,
  onResetError,
  renderConfiguration,
}: AgentFormProps) {
  const error = saveError
    ? actionErrorMessage(saveError, "We couldn’t save this agent. Try again.")
    : undefined;
  const formId = useId();
  const runSettingsDirty = useDraftKeys().includes("run");
  const discardDrafts = useDiscardDrafts();
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
      onSave(agentFields.parse(value), { onSuccess: () => form.reset(value) });
    },
    onSubmitInvalid: ({ formApi }) => {
      // Show the section that holds the first error.
      if (!formApi.getFieldMeta("name")?.isValid) onSectionChange?.("general");
      else if (!formApi.getFieldMeta("instructions")?.isValid) onSectionChange?.("instructions");
    },
  });
  return (
    <form.Subscribe
      selector={(state) =>
        [
          state.isSubmitting,
          ...(agent ? definitionChanges(state.values, defaultValues) : ([false, false] as const)),
        ] as const
      }
    >
      {([isSubmitting, generalChanged, instructionsChanged]) => {
        const busy = pending || isSubmitting;
        const dirty = generalChanged || instructionsChanged;
        // Name, model, and instructions share one draft; run settings save on their own.
        const changed: Record<AgentSettingsSection, boolean> = {
          general: generalChanged,
          instructions: instructionsChanged,
          run: runSettingsDirty,
          skills: false,
          mcps: false,
        };
        const unsaved = agentSettingsSections.filter((item) => changed[item]);
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
                <HarnessAccount
                  userId={userId}
                  organizationId={organizationId}
                  agentId={agent?.id}
                  harness={harness}
                >
                  {(signIn) => (
                    <>
                      <ModelPicker
                        key={`${userId}/${organizationId}`}
                        id={`${formId}-model`}
                        userId={userId}
                        organizationId={organizationId}
                        agentId={agent?.id}
                        harness={harness}
                        model={model}
                        disabled={busy}
                        onSignIn={signIn}
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
                    </>
                  )}
                </HarnessAccount>
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
            <RegisterDraft name="general" dirty={generalChanged} />
            <RegisterDraft name="instructions" dirty={instructionsChanged} />
            <UnsavedChangesGuard
              dirty={unsaved.length > 0}
              description={`Your changes in ${listSections(unsaved)} aren’t saved.`}
              name={`Agent settings: ${listSections(unsaved)}`}
              shouldBlock={({ next }) =>
                next.routeId !== "/_authenticated/_frame/_workspace/agents" ||
                !(next.search.agentId === agent.id && isAgentSettingsSection(next.search.section))
              }
            />
            {section === "general" && (
              <GeneralSettingsLayout
                footer={footer}
                disabled={busy}
                profile={
                  <>
                    {nameField}
                    {picture}
                    <form.Field name="enabled">
                      {(field) => (
                        <Field orientation="horizontal" className="items-center">
                          <FieldContent>
                            <FieldLabel htmlFor={`${formId}-enabled`}>Enabled</FieldLabel>
                            <FieldDescription>
                              Allow this agent to join conversations and respond to its triggers.
                            </FieldDescription>
                          </FieldContent>
                          <Switch
                            id={`${formId}-enabled`}
                            checked={field.state.value}
                            disabled={busy}
                            onCheckedChange={(value) => field.handleChange(value)}
                          />
                        </Field>
                      )}
                    </form.Field>
                  </>
                }
                model={modelField}
                deleteAction={deleteAction}
              />
            )}
            {section === "instructions" && (
              <InstructionsSettingsLayout footer={footer} disabled={busy}>
                {instructionsField}
              </InstructionsSettingsLayout>
            )}
            {(section === "skills" || section === "mcps") && (
              <>
                <form.Subscribe selector={(state) => state.values.harness !== agent.harness}>
                  {(runtimeChanged) =>
                    runtimeChanged && (
                      <p className="mb-4 text-sm text-muted-foreground">
                        These files use the saved runtime. Save the model change to switch runtimes.
                      </p>
                    )
                  }
                </form.Subscribe>
                {renderConfiguration({
                  harness: agent.harness,
                  section,
                  defaults: agent.useStartupDefaults,
                  agentId: agent.id,
                })}
              </>
            )}
            <div hidden={section !== "run"}>{runSettings}</div>
            <UnsavedSectionsBar
              sections={unsaved.filter((item) => item !== section)}
              onSectionChange={(next) => onSectionChange?.(next)}
              onDiscardAll={() => {
                form.reset();
                onResetError?.();
                discardDrafts();
              }}
            />
          </div>
        );
      }}
    </form.Subscribe>
  );
}
