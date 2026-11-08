import type { AgentConfiguration, SaveAgentInput } from "@startup-os/contracts/agents";
import { saveAgentInput } from "@startup-os/contracts/agents";
import type { HarnessKind } from "@startup-os/contracts/harness";

import { revalidateLogic, useForm } from "@tanstack/react-form";

import { useId, useState, type ReactNode } from "react";

import { ModelPicker } from "../model-picker/model-picker";
import { PendingButton } from "@/components/feedback/pending-button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ArrowUpRight, LockKeyhole } from "lucide-react";
import { z } from "zod";

const agentFields = saveAgentInput.extend({
  name: z
    .string()
    .trim()
    .min(1, "Enter an agent name.")
    .max(200, "Use an agent name of 200 characters or fewer."),
});

export type AgentSection = "skills" | "mcps";

export function AgentEditor({
  userId,
  organizationId,
  agent,
  picture,
  pending,
  onClose,
  onSave,
  renderConfiguration,
}: {
  userId: string;
  organizationId?: string | null;
  agent?: AgentConfiguration;
  picture?: ReactNode;
  pending: boolean;
  onClose: () => void;
  onSave: (input: SaveAgentInput) => Promise<void>;
  renderConfiguration: (
    harness: HarnessKind,
    section: AgentSection,
    defaults: boolean,
    agentId?: string,
  ) => ReactNode;
}) {
  const [error, setError] = useState<string>();
  const formId = useId();
  const [tab, setTab] = useState("instructions");
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
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not save changes.");
      }
    },
  });
  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => {
        const busy = pending || isSubmitting;
        return (
          <Dialog
            open
            onOpenChange={(open) => {
              if (!open && !busy) onClose();
            }}
          >
            <DialogContent
              className="flex max-w-5xl flex-col overflow-hidden"
              aria-describedby={undefined}
            >
              <div className="-m-5 flex min-h-0 flex-col">
                <div className="shrink-0 border-b px-5 py-4 sm:px-7">
                  <DialogHeader>
                    <DialogTitle>{agent ? "Edit agent" : "Create agent"}</DialogTitle>
                    <DialogDescription className="sr-only">Agent configuration</DialogDescription>
                  </DialogHeader>
                </div>
                <form
                  id={formId}
                  noValidate
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!busy) void form.handleSubmit();
                  }}
                />
                <div className="flex min-h-0 flex-col">
                  <div
                    role="region"
                    aria-label="Agent configuration"
                    className="min-h-0 min-w-0 overflow-y-auto"
                  >
                    <fieldset disabled={busy} className="min-w-0">
                      <div className="grid min-w-0 md:grid-cols-3">
                        <div className="min-w-0 p-4 sm:p-7 md:col-span-2">
                          <div className="mb-7 flex items-start gap-4">
                            <form.Subscribe selector={(state) => state.values.name}>
                              {(name) => (
                                <Avatar aria-hidden="true" variant="editor" className="size-12">
                                  <AvatarFallback>
                                    {name.trim().charAt(0).toUpperCase() || "A"}
                                  </AvatarFallback>
                                </Avatar>
                              )}
                            </form.Subscribe>
                            <form.Field name="name">
                              {(field) => {
                                const invalid = !field.state.meta.isValid;
                                return (
                                  <Field data-invalid={invalid} className="min-w-0 flex-1">
                                    <FieldLabel htmlFor="agent-name">Agent name</FieldLabel>
                                    <Input
                                      form={formId}
                                      id="agent-name"
                                      required
                                      maxLength={200}
                                      placeholder="Name your agent"
                                      value={field.state.value}
                                      onBlur={field.handleBlur}
                                      onChange={(event) => {
                                        field.handleChange(event.target.value);
                                        if (!field.state.meta.isValid) void field.validate("blur");
                                      }}
                                      aria-invalid={invalid}
                                      aria-describedby={invalid ? "agent-name-error" : undefined}
                                    />
                                    {invalid && (
                                      <FieldError
                                        id="agent-name-error"
                                        errors={field.state.meta.errors}
                                      />
                                    )}
                                  </Field>
                                );
                              }}
                            </form.Field>
                          </div>
                          <Tabs value={tab} onValueChange={setTab} className="min-w-0">
                            <div className="min-w-0 overflow-x-auto border-b pb-1.5">
                              <TabsList variant="line" className="h-9">
                                <TabsTrigger value="instructions">Instructions</TabsTrigger>
                                <TabsTrigger value="skills">Skills</TabsTrigger>
                                <TabsTrigger value="mcps">MCP servers</TabsTrigger>
                              </TabsList>
                            </div>
                            <TabsContent value="instructions" className="mt-3 md:min-h-80">
                              <form.Field name="instructions">
                                {(field) => {
                                  const invalid = !field.state.meta.isValid;
                                  return (
                                    <Field data-invalid={invalid}>
                                      <FieldLabel htmlFor="agent-instructions">
                                        Instructions
                                      </FieldLabel>
                                      <Textarea
                                        id="agent-instructions"
                                        placeholder="What should this agent do?"
                                        rows={12}
                                        maxLength={100000}
                                        className="min-h-64 resize-y md:min-h-80"
                                        value={field.state.value}
                                        onBlur={field.handleBlur}
                                        onChange={(event) => {
                                          field.handleChange(event.target.value);
                                          if (!field.state.meta.isValid)
                                            void field.validate("blur");
                                        }}
                                        aria-invalid={invalid}
                                        aria-describedby={
                                          invalid ? "agent-instructions-error" : undefined
                                        }
                                      />
                                      {invalid && (
                                        <FieldError
                                          id="agent-instructions-error"
                                          errors={field.state.meta.errors}
                                        />
                                      )}
                                    </Field>
                                  );
                                }}
                              </form.Field>
                            </TabsContent>
                            {(["skills", "mcps"] as const).map((section) => (
                              <TabsContent
                                key={section}
                                value={section}
                                className="mt-3 md:min-h-80"
                              >
                                <form.Subscribe
                                  selector={(state) =>
                                    [state.values.harness, state.values.useStartupDefaults] as const
                                  }
                                >
                                  {([harness, defaults]) =>
                                    renderConfiguration(
                                      harness,
                                      section,
                                      defaults ?? true,
                                      agent?.id,
                                    )
                                  }
                                </form.Subscribe>
                              </TabsContent>
                            ))}
                          </Tabs>
                        </div>
                        <aside
                          aria-label="Execution"
                          className="min-w-0 space-y-6 border-t bg-muted/25 p-4 sm:p-7 md:border-t-0 md:border-l md:p-5 lg:p-6"
                        >
                          <div className="space-y-3">
                            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                              Execution
                            </h3>
                            <form.Subscribe
                              selector={(state) =>
                                [state.values.harness, state.values.model] as const
                              }
                            >
                              {([harness, model]) => (
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
                              )}
                            </form.Subscribe>
                          </div>
                          <form.Field name="enabled">
                            {(field) => (
                              <div className="flex items-center justify-between gap-3 border-t pt-5">
                                <FieldLabel htmlFor="agent-enabled">Enabled</FieldLabel>
                                <Switch
                                  id="agent-enabled"
                                  checked={field.state.value}
                                  onCheckedChange={field.handleChange}
                                />
                              </div>
                            )}
                          </form.Field>
                          <div className="border-t pt-3">
                            {[
                              { value: "skills", label: "Skills" },
                              { value: "mcps", label: "MCP servers" },
                            ].map((section) => (
                              <Button
                                key={section.value}
                                type="button"
                                variant="ghost"
                                onClick={() => setTab(section.value)}
                                className="w-full justify-between"
                              >
                                {section.label}
                                <ArrowUpRight className="size-3.5 text-muted-foreground" />
                              </Button>
                            ))}
                          </div>
                          {picture && <div className="border-t pt-5">{picture}</div>}
                        </aside>
                      </div>
                    </fieldset>
                  </div>
                  {error && (
                    <p role="alert" className="shrink-0 px-5 py-2 text-sm text-destructive">
                      {error}
                    </p>
                  )}
                  <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t bg-card px-4 py-3 sm:px-7">
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      <LockKeyhole className="size-3.5" />
                      Personal agent
                    </span>
                    <div className="ml-auto flex gap-2">
                      <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
                        Cancel
                      </Button>
                      <PendingButton
                        type="submit"
                        form={formId}
                        pending={busy}
                        pendingLabel="Save agent"
                      >
                        Save agent
                      </PendingButton>
                    </div>
                  </footer>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        );
      }}
    </form.Subscribe>
  );
}
