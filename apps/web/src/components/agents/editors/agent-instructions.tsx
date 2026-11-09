import { harnessInstructionsFiles, type HarnessKind } from "@startup-os/contracts/harness";

import { useId, type ComponentProps } from "react";

import { StartupInstructions } from "./startup-instructions";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "cn";
import { ChevronRight } from "lucide-react";

export function AgentInstructions({
  harness,
  name,
  agentId,
  organizationId,
  defaults,
  tall = false,
  value,
  invalid,
  errors,
  onBlur,
  onChange,
}: {
  harness: HarnessKind;
  name: string;
  agentId?: string;
  organizationId?: string | null;
  defaults: boolean;
  /** Settings pages have room for a taller editor than the create dialog. */
  tall?: boolean;
  value: string;
  invalid: boolean;
  errors: ComponentProps<typeof FieldError>["errors"];
  onBlur: () => void;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="grid gap-4">
      <Field data-invalid={invalid}>
        <FieldLabel htmlFor={id}>Additional instructions (optional)</FieldLabel>
        <FieldDescription id={`${id}-description`}>
          Written to {harnessInstructionsFiles[harness]}
          {defaults ? " after the built-in Startup OS rules" : ""} for new sessions. Leave blank to
          use {defaults ? "only the built-in rules" : "no custom instructions"}.
        </FieldDescription>
        <Textarea
          id={id}
          placeholder="For example: Review releases and summarize risks."
          className={cn("max-h-128", tall ? "min-h-56" : "min-h-24")}
          maxLength={100000}
          value={value}
          onBlur={onBlur}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={invalid}
          aria-describedby={`${id}-description${invalid ? ` ${id}-error` : ""}`}
        />
        {invalid && <FieldError id={`${id}-error`} errors={errors} />}
      </Field>
      {defaults && (
        <details className="group rounded-xl border bg-card">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium select-none [&::-webkit-details-marker]:hidden">
            <ChevronRight
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
            />
            View built-in Startup OS rules
          </summary>
          <div className="border-t p-4">
            <StartupInstructions
              harness={harness}
              name={name}
              agentId={agentId}
              organizationId={organizationId}
            />
          </div>
        </details>
      )}
    </div>
  );
}
