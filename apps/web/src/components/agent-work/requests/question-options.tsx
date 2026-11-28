import type { AgentRequestPayload } from "@substrate/contracts/agent-work";

import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { Kbd } from "@/components/ui/kbd";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type Question = Extract<AgentRequestPayload, { type: "questions" }>["questions"][number];
type QuestionOption = Question["options"][number];

function OptionText({ option }: { option: QuestionOption }) {
  return (
    <FieldContent className="min-w-0 wrap-anywhere">
      <span>{option.label}</span>
      {option.description && (
        <span className="text-xs font-normal text-muted-foreground">{option.description}</span>
      )}
    </FieldContent>
  );
}

function OptionShortcut({ index }: { index: number }) {
  return (
    index < 9 && (
      <span
        aria-hidden="true"
        className="mt-px opacity-0 transition-opacity duration-150 group-focus-within/question:opacity-100 motion-reduce:transition-none"
      >
        <Kbd>{index + 1}</Kbd>
      </span>
    )
  );
}

export function QuestionOptions({
  question,
  selected,
  idPrefix,
  labelledBy,
  pending,
  onChoose,
}: {
  question: Question;
  selected: string[] | undefined;
  idPrefix: string;
  labelledBy: string;
  pending: boolean;
  onChoose: (label: string) => void;
}) {
  const firstSelection = selected?.[0];
  const secondSelection = selected?.[1];
  const selectedLabels =
    question.multiSelect && selected && selected.length > 2 ? new Set(selected) : undefined;
  if (question.multiSelect)
    return (
      <div role="group" aria-labelledby={labelledBy} className="grid gap-2">
        {question.options.map((option, index) => (
          <FieldLabel key={option.label} htmlFor={`${idPrefix}-${index}`}>
            <Field orientation="horizontal">
              <Checkbox
                id={`${idPrefix}-${index}`}
                checked={
                  selectedLabels?.has(option.label) ??
                  (firstSelection === option.label || secondSelection === option.label)
                }
                disabled={pending}
                onCheckedChange={() => onChoose(option.label)}
              />
              <OptionText option={option} />
              <OptionShortcut index={index} />
            </Field>
          </FieldLabel>
        ))}
      </div>
    );
  return (
    <RadioGroup
      aria-labelledby={labelledBy}
      value={firstSelection ?? ""}
      disabled={pending}
      onValueChange={onChoose}
    >
      {question.options.map((option, index) => (
        <FieldLabel key={option.label} htmlFor={`${idPrefix}-${index}`}>
          <Field orientation="horizontal">
            <RadioGroupItem id={`${idPrefix}-${index}`} value={option.label} />
            <OptionText option={option} />
            <OptionShortcut index={index} />
          </Field>
        </FieldLabel>
      ))}
    </RadioGroup>
  );
}
