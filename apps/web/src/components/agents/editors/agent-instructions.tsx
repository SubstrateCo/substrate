import { useId, type ComponentProps, type ReactNode } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Pressable } from "@/components/ui/pressable";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "cn";
import { ChevronRight } from "lucide-react";

export function AgentInstructions({
  startupInstructions,
  defaults,
  creating = false,
  value,
  invalid,
  errors,
  onBlur,
  onChange,
}: {
  startupInstructions: ReactNode;
  defaults: boolean;
  creating?: boolean;
  value: string;
  invalid: boolean;
  errors: ComponentProps<typeof FieldError>["errors"];
  onBlur: () => void;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="grid gap-3">
      <Field data-invalid={invalid}>
        <FieldLabel htmlFor={id}>
          {creating ? "What should it help with? (optional)" : "Additional instructions (optional)"}
        </FieldLabel>
        <Textarea
          id={id}
          placeholder="For example: Review releases and summarize risks."
          className={cn("max-h-128", creating ? "min-h-24" : "min-h-32")}
          maxLength={100000}
          value={value}
          onBlur={onBlur}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={invalid}
          aria-describedby={invalid ? `${id}-error` : undefined}
        />
        {invalid && <FieldError id={`${id}-error`} errors={errors} />}
      </Field>
      {defaults && (
        <Collapsible asChild>
          <div className="group/rules">
            <CollapsibleTrigger asChild>
              <Pressable className="flex w-full items-center gap-2 rounded-md py-2 text-sm text-muted-foreground select-none hover:text-foreground">
                <ChevronRight
                  aria-hidden="true"
                  className="size-4 shrink-0 transition-transform duration-150 ease-out group-data-[state=open]/rules:rotate-90 motion-reduce:transition-none"
                />
                Built-in rules
              </Pressable>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="max-h-64 overflow-y-auto rounded-lg bg-inset p-3">
                {startupInstructions}
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      )}
    </div>
  );
}
