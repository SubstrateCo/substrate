import type { AgentRequestPayload, AgentRequestResponse } from "@startup-os/contracts/agent-work";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { PendingButton } from "@/components/feedback/pending-button";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  questionAnswer,
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

const optionRow =
  "flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-row-hover has-[[data-state=checked]]:border-primary/50 has-[[data-state=checked]]:bg-primary/5 has-disabled:cursor-default has-disabled:opacity-60";

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
  const moved = useRef(false);
  const question = payload.questions[step]!;
  const last = step === payload.questions.length - 1;
  const answered = questionAnswer(drafts[question.id]).length > 0;
  const selected = drafts[question.id]?.selected ?? [];
  const shortcuts = Math.min(question.options.length, 9);
  // Move focus to the new question only after the owner changed steps, not on mount.
  useEffect(() => {
    if (moved.current) promptRef.current?.focus();
  }, [step]);
  const goTo = (next: number) => {
    moved.current = true;
    setStep(next);
  };
  const update = (draft: QuestionDraft) =>
    setDrafts((previous) => ({ ...previous, [question.id]: draft }));
  const next = () => {
    if (!answered || pending) return;
    if (last) onSubmit(questionsResponse(payload.questions, drafts));
    else goTo(step + 1);
  };
  const choose = (label: string) => {
    if (pending) return;
    update(toggleQuestionOption(drafts[question.id], label, question.multiSelect));
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
    <span className="min-w-0 flex-1">
      <span className="block">{option.label}</span>
      {option.description && (
        <span className="block text-xs text-muted-foreground">{option.description}</span>
      )}
    </span>
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
        <div className="flex items-baseline justify-between gap-3">
          {question.header && (
            <span className="text-xs font-medium text-muted-foreground">{question.header}</span>
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
          className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {question.question}
        </p>
      </div>
      {question.multiSelect ? (
        <div role="group" aria-labelledby={`${id}-question`} className="grid gap-2">
          {question.options.map((option, index) => (
            <label key={option.label} htmlFor={`${id}-${step}-${index}`} className={optionRow}>
              <Checkbox
                id={`${id}-${step}-${index}`}
                checked={selected.includes(option.label)}
                disabled={pending}
                onCheckedChange={() => choose(option.label)}
                className="mt-0.5"
              />
              {optionText(option)}
              {shortcut(index)}
            </label>
          ))}
        </div>
      ) : (
        <RadioGroup
          aria-labelledby={`${id}-question`}
          value={selected[0] ?? ""}
          disabled={pending}
          onValueChange={choose}
        >
          {question.options.map((option, index) => (
            <label key={option.label} htmlFor={`${id}-${step}-${index}`} className={optionRow}>
              <RadioGroupItem
                id={`${id}-${step}-${index}`}
                value={option.label}
                className="mt-0.5"
              />
              {optionText(option)}
              {shortcut(index)}
            </label>
          ))}
        </RadioGroup>
      )}
      {question.allowCustom && (
        <Input
          aria-label="Your own answer"
          placeholder="Or type your own answer"
          value={drafts[question.id]?.custom ?? ""}
          disabled={pending}
          onChange={(event) =>
            update(setQuestionCustom(drafts[question.id], event.target.value, question.multiSelect))
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
          disabled={!answered}
          pending={pending}
          pendingLabel="Sending…"
          onClick={next}
        >
          {last ? "Submit" : "Next"}
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
