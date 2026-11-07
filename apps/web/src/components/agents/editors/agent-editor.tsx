import type { AgentConfiguration, SaveAgentInput } from "@startup-os/contracts/agents";
import { saveAgentInput } from "@startup-os/contracts/agents";

import { useForm } from "@tanstack/react-form";

import { useState, type ReactNode } from "react";

import { harnessOptions } from "../harness-meta";
import { EditorDialog } from "./editor-dialog";
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
import { z } from "zod";

const agentFields = saveAgentInput.extend({
  name: z
    .string()
    .trim()
    .min(1, "Enter an agent name.")
    .max(200, "Use an agent name of 200 characters or fewer."),
});

export function AgentEditor({
  agent,
  picture,
  pending,
  onClose,
  onSave,
}: {
  agent?: AgentConfiguration;
  picture?: ReactNode;
  pending: boolean;
  onClose: () => void;
  onSave: (input: SaveAgentInput) => Promise<void>;
}) {
  const [error, setError] = useState<string>();
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
    validators: {
      onChange: agentFields,
      onBlur: agentFields,
      onSubmit: agentFields,
    },
    onSubmit: async ({ value }) => {
      if (pending) return;
      setError(undefined);
      const parsed = agentFields.parse(value);
      try {
        await onSave(parsed);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not save changes.");
      }
    },
  });
  return (
    <form.Subscribe selector={(state) => [state.isSubmitting, state.submissionAttempts] as const}>
      {([isSubmitting, submissionAttempts]) => (
        <EditorDialog
          title={agent ? "Edit agent" : "Create agent"}
          saveLabel="Save agent"
          description="These agent settings belong to you, not your organization."
          pending={pending || isSubmitting}
          onClose={onClose}
          onSubmit={() => form.handleSubmit()}
          error={error}
        >
          {agent ? (
            picture
          ) : (
            <p className="text-sm text-muted-foreground">
              Save this agent before adding a profile picture
            </p>
          )}
          <form.Field name="name">
            {(field) => {
              const invalid =
                (field.state.meta.isBlurred || submissionAttempts > 0) && !field.state.meta.isValid;
              return (
                <Field data-invalid={invalid}>
                  <FieldLabel htmlFor="agent-name">Agent name</FieldLabel>
                  <Input
                    id="agent-name"
                    required
                    maxLength={200}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-invalid={invalid}
                    aria-describedby={invalid ? "agent-name-error" : undefined}
                  />
                  {invalid && <FieldError id="agent-name-error" errors={field.state.meta.errors} />}
                </Field>
              );
            }}
          </form.Field>
          <form.Field name="harness">
            {(field) => {
              const invalid =
                (field.state.meta.isBlurred || submissionAttempts > 0) && !field.state.meta.isValid;
              const harness = harnessOptions.find((option) => option.value === field.state.value)!;
              return (
                <Field data-invalid={invalid}>
                  <FieldLabel htmlFor="agent-harness">Harness</FieldLabel>
                  <Select
                    value={field.state.value}
                    onValueChange={(value) => {
                      const option = harnessOptions.find((entry) => entry.value === value);
                      if (option) {
                        field.handleChange(option.value);
                        form.setFieldValue("model", undefined);
                      }
                    }}
                  >
                    <SelectTrigger
                      id="agent-harness"
                      onBlur={field.handleBlur}
                      aria-invalid={invalid}
                      aria-describedby={`agent-harness-hint${invalid ? " agent-harness-error" : ""}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {harnessOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {invalid && (
                    <FieldError id="agent-harness-error" errors={field.state.meta.errors} />
                  )}
                  <FieldDescription id="agent-harness-hint">{harness.description}</FieldDescription>
                </Field>
              );
            }}
          </form.Field>
          <form.Subscribe selector={(state) => state.values.harness}>
            {(harness) => (
              <form.Field name="model">
                {(field) => {
                  const invalid =
                    (field.state.meta.isBlurred || submissionAttempts > 0) &&
                    !field.state.meta.isValid;
                  return (
                    <Field data-invalid={invalid}>
                      <FieldLabel htmlFor="agent-model">Model</FieldLabel>
                      <Input
                        id="agent-model"
                        placeholder={
                          harnessOptions.find((option) => option.value === harness)!.modelHint
                        }
                        value={field.state.value ?? ""}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value || undefined)}
                        aria-invalid={invalid}
                        aria-describedby={`agent-model-hint${invalid ? " agent-model-error" : ""}`}
                      />
                      {invalid && (
                        <FieldError id="agent-model-error" errors={field.state.meta.errors} />
                      )}
                      <FieldDescription id="agent-model-hint">
                        Optional. Leave blank to use the harness default. Sign in through the
                        installed harness, not here.
                      </FieldDescription>
                    </Field>
                  );
                }}
              </form.Field>
            )}
          </form.Subscribe>
          <form.Field name="instructions">
            {(field) => {
              const invalid =
                (field.state.meta.isBlurred || submissionAttempts > 0) && !field.state.meta.isValid;
              return (
                <Field data-invalid={invalid}>
                  <FieldLabel htmlFor="agent-instructions">Instructions</FieldLabel>
                  <Textarea
                    id="agent-instructions"
                    rows={5}
                    maxLength={100000}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-invalid={invalid}
                    aria-describedby={invalid ? "agent-instructions-error" : undefined}
                  />
                  {invalid && (
                    <FieldError id="agent-instructions-error" errors={field.state.meta.errors} />
                  )}
                </Field>
              );
            }}
          </form.Field>
          <form.Field name="enabled">
            {(field) => {
              const invalid =
                (field.state.meta.isBlurred || submissionAttempts > 0) && !field.state.meta.isValid;
              return (
                <Field orientation="horizontal" data-invalid={invalid}>
                  <Switch
                    id="agent-enabled"
                    checked={field.state.value}
                    onCheckedChange={field.handleChange}
                    onBlur={field.handleBlur}
                    aria-invalid={invalid}
                    aria-describedby={invalid ? "agent-enabled-error" : undefined}
                  />
                  <FieldContent>
                    <FieldLabel htmlFor="agent-enabled">Enabled</FieldLabel>
                    {invalid && (
                      <FieldError id="agent-enabled-error" errors={field.state.meta.errors} />
                    )}
                  </FieldContent>
                </Field>
              );
            }}
          </form.Field>
          <p className="text-sm text-muted-foreground">
            New agents automatically include the bundled Startup OS skill and built-in Startup OS
            MCP server with only hello_world. This does not grant access to app data.
          </p>
        </EditorDialog>
      )}
    </form.Subscribe>
  );
}
