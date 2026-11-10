import type { AgentConfiguration, SaveAgentInput } from "@startup-os/contracts/agents";
import { saveAgentInput } from "@startup-os/contracts/agents";
import type { HarnessKind } from "@startup-os/contracts/harness";

import { revalidateLogic, useForm } from "@tanstack/react-form";

import { useId, useState, type ReactNode } from "react";

import { SettingsNav, type SettingsNavItem } from "../layout/settings-nav";
import {
  GroupTitle,
  SettingsCard,
  SettingsFooter,
  SettingsSection,
} from "../layout/settings-section";
import { HarnessAvailability } from "../model-picker/harness-availability";
import { ModelPicker } from "../model-picker/model-picker";
import { AgentInstructions } from "./agent-instructions";
import { PendingButton } from "@/components/feedback/pending-button";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Blocks, ScrollText, SlidersHorizontal, Sparkles, Zap } from "lucide-react";
import { z } from "zod";

const agentFields = saveAgentInput.extend({
  name: z
    .string()
    .trim()
    .min(1, "Enter an agent name.")
    .max(200, "Use an agent name of 200 characters or fewer."),
});

export type AgentSection = "skills" | "mcps";

const sections = [
  { value: "general", label: "General", icon: SlidersHorizontal },
  { value: "instructions", label: "Instructions", icon: ScrollText },
  { value: "skills", label: "Skills", icon: Sparkles },
  { value: "mcps", label: "MCP servers", icon: Blocks },
  { value: "run", label: "Run settings", icon: Zap },
] as const satisfies readonly SettingsNavItem<string>[];

type SettingsTab = (typeof sections)[number]["value"];

type AgentFormProps = {
  userId: string;
  organizationId?: string | null;
  agent?: AgentConfiguration;
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
 * Create mode is one short page. Edit mode is a settings page with a section list beside the
 * selected section. Name, model, and instructions share one draft across sections.
 */
export function AgentForm({
  userId,
  organizationId,
  agent,
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
  const [tab, setTab] = useState<SettingsTab>("general");
  const visibleSections = runSettings
    ? sections
    : sections.filter((section) => section.value !== "run");
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
    validationLogic: revalidateLogic({ mode: "blur", modeAfterSubmission: "change" }),
    validators: { onDynamic: agentFields },
    onSubmit: async ({ value }) => {
      if (pending) return;
      setError(undefined);
      try {
        await onSave(agentFields.parse(value));
        form.reset(value);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not save changes.");
      }
    },
    onSubmitInvalid: () => setTab("general"),
  });
  return (
    <form.Subscribe selector={(state) => [state.isSubmitting, state.isDirty] as const}>
      {([isSubmitting, dirty]) => {
        const busy = pending || isSubmitting;
        const nameField = (
          <form.Field name="name">
            {(field) => {
              const invalid = !field.state.meta.isValid;
              return (
                <Field data-invalid={invalid} className="min-w-0">
                  <FieldLabel htmlFor={`${formId}-name`}>Agent name</FieldLabel>
                  <Input
                    form={formId}
                    id={`${formId}-name`}
                    required
                    maxLength={200}
                    placeholder="For example: Release helper"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => {
                      field.handleChange(event.target.value);
                      if (!field.state.meta.isValid) void field.validate("blur");
                    }}
                    aria-invalid={invalid}
                    aria-describedby={invalid ? `${formId}-name-error` : undefined}
                  />
                  {invalid && (
                    <FieldError id={`${formId}-name-error`} errors={field.state.meta.errors} />
                  )}
                </Field>
              );
            }}
          </form.Field>
        );
        const modelField = (
          <form.Subscribe selector={(state) => [state.values.harness, state.values.model] as const}>
            {([harness, model]) => (
              <div className="grid min-w-0 gap-2">
                <ModelPicker
                  key={`${userId}/${organizationId}`}
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
                    tall={!!agent}
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
            status={
              error ? (
                <p role="alert" className="text-destructive">
                  {error}
                </p>
              ) : (
                agent && dirty && <p className="text-muted-foreground">You have unsaved changes.</p>
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
              pendingLabel={agent ? "Save changes" : "Create agent"}
            >
              {agent ? "Save changes" : "Create agent"}
            </PendingButton>
          </SettingsFooter>
        );
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
          return (
            <div className="grid min-w-0 gap-6">
              {formElement}
              <fieldset disabled={busy} className="grid min-w-0 gap-6">
                {nameField}
                <div className="grid min-w-0 gap-2">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Model</p>
                    <p className="text-sm text-muted-foreground">
                      Pick a harness and model. You can change it later.
                    </p>
                  </div>
                  {modelField}
                </div>
                {instructionsField}
              </fieldset>
              {footer}
            </div>
          );

        return (
          <div className="@container min-w-0">
            {formElement}
            <div className="flex min-w-0 flex-col items-stretch gap-6 @3xl:flex-row @3xl:items-start @3xl:gap-10">
              <SettingsNav
                label="Agent settings sections"
                items={visibleSections}
                value={tab}
                onChange={setTab}
              />
              <div className="@container/content w-full max-w-5xl min-w-0 flex-1">
                {tab === "general" && (
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
                            description="The harness and model run on this agent’s desktop."
                          />
                          {modelField}
                        </section>
                      </fieldset>
                    </SettingsCard>
                    {deleteAction}
                  </SettingsSection>
                )}
                {tab === "instructions" && (
                  <SettingsSection
                    title="Instructions"
                    description="Tell this agent its role, tone, and rules."
                  >
                    <SettingsCard label="Agent instructions" footer={footer}>
                      <fieldset disabled={busy} className="min-w-0">
                        {instructionsField}
                      </fieldset>
                    </SettingsCard>
                  </SettingsSection>
                )}
                {(tab === "skills" || tab === "mcps") && (
                  <form.Subscribe
                    selector={(state) =>
                      [state.values.harness, state.values.useStartupDefaults] as const
                    }
                  >
                    {([harness, defaults]) =>
                      renderConfiguration(harness, tab, defaults ?? true, agent.id)
                    }
                  </form.Subscribe>
                )}
                {tab === "run" && runSettings}
              </div>
            </div>
          </div>
        );
      }}
    </form.Subscribe>
  );
}
