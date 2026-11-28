import type { AgentRequestPayload, AgentRequestResponse } from "@substrate/contracts/agent-work";

import { useId, useRef, useState, type KeyboardEvent, type RefObject } from "react";

import { QuestionOptions } from "./question-options";
import { PendingButton } from "@/components/feedback/pending-button";
import { useFocusAfterRender } from "@/components/feedback/use-focus-after-render";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  questionAnswer,
  questionReady,
  questionsResponse,
  setQuestionCustom,
  toggleQuestionOption,
  type QuestionDraft,
} from "@/lib/agent-work/questions";

type Questions = Extract<AgentRequestPayload, { type: "questions" }>;
type Question = Questions["questions"][number];

function typingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

function shortcutOption(event: KeyboardEvent<HTMLDivElement>, question: Question) {
  const modified = [event.altKey, event.ctrlKey, event.metaKey, event.shiftKey].some(Boolean);
  if (modified) return undefined;
  if (typingTarget(event.target)) return undefined;
  const index = Number(event.key) - 1;
  return Number.isInteger(index) && index >= 0 ? question.options[index] : undefined;
}

function nextButtonLabel(last: boolean, skipping: boolean) {
  if (skipping) return last ? "Skip and submit" : "Skip";
  return last ? "Submit" : "Next";
}

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
  const skipping = !answered && question.optional === true;
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
    const option = shortcutOption(event, question);
    if (!option) return;
    event.preventDefault();
    choose(option.label);
  };
  return (
    <div className="group/question grid gap-3" onKeyDown={onKeyDown}>
      <QuestionPrompt
        question={question}
        step={step}
        count={payload.questions.length}
        promptId={`${id}-question`}
        promptRef={promptRef}
      />
      <QuestionOptions
        question={question}
        selected={draft?.selected}
        idPrefix={`${id}-${step}`}
        labelledBy={`${id}-question`}
        pending={pending}
        onChoose={choose}
      />
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
      <QuestionActions
        step={step}
        pending={pending}
        ready={ready}
        skipping={skipping}
        nextLabel={nextButtonLabel(last, skipping)}
        shortcuts={Math.min(question.options.length, 9)}
        onBack={() => goTo(step - 1)}
        onNext={next}
      />
    </div>
  );
}

function QuestionPrompt({
  question,
  step,
  count,
  promptId,
  promptRef,
}: {
  question: Question;
  step: number;
  count: number;
  promptId: string;
  promptRef: RefObject<HTMLParagraphElement | null>;
}) {
  return (
    <div className="grid gap-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        {(question.header || question.optional) && (
          <span className="min-w-0 text-xs wrap-anywhere text-muted-foreground">
            {question.header && <span className="font-medium">{question.header}</span>}
            {question.header && question.optional && " · "}
            {question.optional && "Optional"}
          </span>
        )}
        {count > 1 && (
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">
            Question {step + 1} of {count}
          </span>
        )}
      </div>
      <p
        ref={promptRef}
        id={promptId}
        tabIndex={-1}
        className="rounded-sm wrap-anywhere outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {question.question}
      </p>
    </div>
  );
}

function QuestionActions({
  step,
  pending,
  ready,
  skipping,
  nextLabel,
  shortcuts,
  onBack,
  onNext,
}: {
  step: number;
  pending: boolean;
  ready: boolean;
  skipping: boolean;
  nextLabel: string;
  shortcuts: number;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {step > 0 && (
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={onBack}>
          Back
        </Button>
      )}
      <PendingButton
        type="button"
        size="sm"
        variant={skipping ? "outline" : "default"}
        disabled={!ready}
        pending={pending}
        onClick={onNext}
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
  );
}
