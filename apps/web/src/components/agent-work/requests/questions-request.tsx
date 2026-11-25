import type { AgentRequestPayload, AgentRequestResponse } from "@substrate/contracts/agent-work";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { PendingButton } from "@/components/feedback/pending-button";
import { useFocusAfterRender } from "@/components/feedback/use-focus-after-render";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  questionAnswer,
  questionReady,
  questionsResponse,
  setQuestionCustom,
  toggleQuestionOption,
  type QuestionDraft,
} from "@/lib/agent-work/questions";

type Questions = Extract<AgentRequestPayload, { type: "questions" }>;

function typingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

/**
 * Mount one panel per request, keyed by request ID, so drafts belong to that request. Number
 * keys choose an option only while focus is inside this panel, and the owner moves on with Next.
 */
export function QuestionsRequest({
  payload,
  pending,
  onSubmit,
}: {
  payload: Questions;
  pending: boolean;
  onSubmit: (response: Extract<AgentRequestResponse, { type: "questions" }>) => void;
}) {
  const [step, setStep] = useState(0);
  const [drafts, setDrafts] = useState<Partial<Record<string, QuestionDraft>>>({});
  const id = useId();
  const promptRef = useRef<HTMLParagraphElement>(null);
  const focusAfterRender = useFocusAfterRender();
  const question = payload.questions[step]!;
  const last = step === payload.questions.length - 1;
  const draft = drafts[question.id];
  const answered = questionAnswer(draft).length > 0;
  const ready = questionReady(question, draft);
  const selected = draft?.selected;
  const firstSelection = selected?.[0];
  const secondSelection = selected?.[1];
  const selectedLabels = useMemo(
    () => (question.multiSelect && selected && selected.length > 2 ? new Set(selected) : undefined),
    [question.multiSelect, selected],
  );
  let nextLabel = last ? "Submit" : "Next";
  const skipping = !answered && question.optional === true;
  if (skipping) nextLabel = last ? "Skip and submit" : "Skip";
  const shortcuts = Math.min(question.options.length, 9);
  // Focus moves to the new question once it shows.
  const goTo = (next: number) => {
    setStep(next);
    focusAfterRender(() => promptRef.current);
  };
  const update = (draft: QuestionDraft) =>
    setDrafts((previous) => ({ ...previous, [question.id]: draft }));
  const next = () => {
    if (!ready || pending) return;
    if (last) onSubmit(questionsResponse(payload.questions, drafts));
    else goTo(step + 1);
  };
  const choose = (label: string) => {
    if (pending) return;
    update(toggleQuestionOption(draft, label, question.multiSelect));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const modified = [event.altKey, event.ctrlKey, event.metaKey, event.shiftKey].some(Boolean);
    if (modified) return;
    if (typingTarget(event.target)) return;
    const index = Number(event.key) - 1;
    const option = Number.isInteger(index) && index >= 0 ? question.options[index] : undefined;
    if (!option) return;
    event.preventDefault();
    choose(option.label);
  };
  const optionText = (option: Questions["questions"][number]["options"][number]) => (
    <FieldContent className="min-w-0 wrap-anywhere">
      <span>{option.label}</span>
      {option.description && (
        <span className="text-xs font-normal text-muted-foreground">{option.description}</span>
      )}
    </FieldContent>
  );
  const shortcut = (index: number) =>
    index < 9 && (
      <span
        aria-hidden="true"
        className="mt-px opacity-0 transition-opacity duration-150 group-focus-within/question:opacity-100 motion-reduce:transition-none"
      >
        <Kbd>{index + 1}</Kbd>
      </span>
    );
  return (
    // The card around this shows the title.
    <div className="group/question grid gap-3" onKeyDown={onKeyDown}>
      <div className="grid gap-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          {(question.header || question.optional) && (
            <span className="min-w-0 text-xs wrap-anywhere text-muted-foreground">
              {question.header && <span className="font-medium">{question.header}</span>}
              {question.header && question.optional && " · "}
              {question.optional && "Optional"}
            </span>
          )}
          {payload.questions.length > 1 && (
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">
              Question {step + 1} of {payload.questions.length}
            </span>
          )}
        </div>
        <p
          ref={promptRef}
          id={`${id}-question`}
          tabIndex={-1}
          className="rounded-sm wrap-anywhere outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {question.question}
        </p>
      </div>
      {question.multiSelect ? (
        <div role="group" aria-labelledby={`${id}-question`} className="grid gap-2">
          {question.options.map((option, index) => (
            <FieldLabel key={option.label} htmlFor={`${id}-${step}-${index}`}>
              <Field orientation="horizontal">
                <Checkbox
                  id={`${id}-${step}-${index}`}
                  checked={
                    selectedLabels?.has(option.label) ??
                    (firstSelection === option.label || secondSelection === option.label)
                  }
                  disabled={pending}
                  onCheckedChange={() => choose(option.label)}
                />
                {optionText(option)}
                {shortcut(index)}
              </Field>
            </FieldLabel>
          ))}
        </div>
      ) : (
        <RadioGroup
          aria-labelledby={`${id}-question`}
          value={firstSelection ?? ""}
          disabled={pending}
          onValueChange={choose}
        >
          {question.options.map((option, index) => (
            <FieldLabel key={option.label} htmlFor={`${id}-${step}-${index}`}>
              <Field orientation="horizontal">
                <RadioGroupItem id={`${id}-${step}-${index}`} value={option.label} />
                {optionText(option)}
                {shortcut(index)}
              </Field>
            </FieldLabel>
          ))}
        </RadioGroup>
      )}
      {question.allowCustom && (
        <Input
          aria-label="Your own answer"
          placeholder="Or type your own answer"
          value={draft?.custom ?? ""}
          disabled={pending}
          onChange={(event) =>
            update(setQuestionCustom(draft, event.target.value, question.multiSelect))
          }
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              next();
            }
          }}
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        {step > 0 && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => goTo(step - 1)}
          >
            Back
          </Button>
        )}
        <PendingButton
          type="button"
          size="sm"
          variant={skipping ? "outline" : "default"}
          disabled={!ready}
          pending={pending}
          onClick={next}
        >
          {nextLabel}
        </PendingButton>
        {shortcuts > 1 && (
          <span
            aria-hidden="true"
            className="ml-auto hidden text-xs text-muted-foreground opacity-0 transition-opacity duration-150 group-focus-within/question:opacity-100 motion-reduce:transition-none sm:inline"
          >
            Press 1–{shortcuts} to choose
          </span>
        )}
      </div>
    </div>
  );
}
