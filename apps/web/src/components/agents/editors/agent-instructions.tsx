import { harnessInstructionsFiles, type HarnessKind } from "@substrate/contracts/harness";

import { useId, type ComponentProps } from "react";

import { StartupInstructions } from "./startup-instructions";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Pressable } from "@/components/ui/pressable";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "cn";
import { ChevronRight } from "lucide-react";

export function AgentInstructions({
  harness,
  name,
  agentId,
  organizationId,
  defaults,
  creating = false,
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
  /** The create dialog asks in plain words and leaves file details to settings. */
  creating?: boolean;
  value: string;
  invalid: boolean;
  errors: ComponentProps<typeof FieldError>["errors"];
  onBlur: () => void;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const file = harnessInstructionsFiles[harness];
  let description;
  if (creating)
    description = defaults
      ? "Its role, tone, and limits. Added after the built-in Substrate rules."
      : "Its role, tone, and limits.";
  else
    description = defaults
      ? `Substrate writes these to ${file} after the built-in rules. New sessions use them.`
      : `Substrate writes these to ${file}. New sessions use them.`;
  return (
    <div className="grid gap-3">
      <Field data-invalid={invalid}>
        <FieldLabel htmlFor={id}>
          {creating ? "What should it help with? (optional)" : "Additional instructions (optional)"}
        </FieldLabel>
        <Textarea
          id={id}
          placeholder="For example: Review releases and summarize risks."
          className={cn("max-h-128", creating ? "min-h-24" : "min-h-56")}
          maxLength={100000}
          value={value}
          onBlur={onBlur}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={invalid}
          aria-describedby={invalid ? `${id}-error` : `${id}-description`}
        />
        {invalid ? (
          <FieldError id={`${id}-error`} errors={errors} />
        ) : (
          <FieldDescription id={`${id}-description`}>{description}</FieldDescription>
        )}
      </Field>
      {defaults && (
        <Collapsible asChild>
          <div className="group/rules rounded-lg border">
            <CollapsibleTrigger asChild>
              <Pressable className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground select-none hover:text-foreground">
                <ChevronRight
                  aria-hidden="true"
                  className="size-4 shrink-0 transition-transform duration-150 ease-out group-data-[state=open]/rules:rotate-90 motion-reduce:transition-none"
                />
                View built-in Substrate rules
              </Pressable>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="max-h-64 overflow-y-auto border-t p-3">
                <StartupInstructions
                  harness={harness}
                  name={name}
                  agentId={agentId}
                  organizationId={organizationId}
                />
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      )}
    </div>
  );
}
