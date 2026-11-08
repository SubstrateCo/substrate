import type {
  AgentRunRequestPayload,
  AgentRunRequestResponse,
} from "@startup-os/contracts/agent-runs";

import { useEffect, useEffectEvent, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import {
  questionAnswer,
  questionsResponse,
  setQuestionCustom,
  toggleQuestionOption,
  type QuestionDraft,
} from "@/lib/agent-runs/runs";
import { cn } from "cn";

type Questions = Extract<AgentRunRequestPayload, { type: "questions" }>;

// With several open panels, number keys go to the one that opened last.
const panels: symbol[] = [];

function typingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

// Mount one panel per request, keyed by request ID, so drafts belong to that request.
export function QuestionsRequest({
  payload,
  pending,
  onSubmit,
}: {
  payload: Questions;
  pending: boolean;
  onSubmit: (response: Extract<AgentRunRequestResponse, { type: "questions" }>) => void;
}) {
  const [step, setStep] = useState(0);
  const [drafts, setDrafts] = useState<Partial<Record<string, QuestionDraft>>>({});
  const advance = useRef<ReturnType<typeof setTimeout>>(undefined);
  const token = useRef(Symbol("questions"));
  const id = useId();
  const question = payload.questions[step]!;
  const last = step === payload.questions.length - 1;
  const answered = questionAnswer(drafts[question.id]).length > 0;
  const update = (draft: QuestionDraft) =>
    setDrafts((previous) => ({ ...previous, [question.id]: draft }));
  const next = () => {
    if (!answered || pending) return;
    if (last) onSubmit(questionsResponse(payload.questions, drafts));
    else setStep(step + 1);
  };
  const choose = (label: string) => {
    if (pending) return;
    clearTimeout(advance.current);
    update(toggleQuestionOption(drafts[question.id], label, question.multiSelect));
    if (!question.multiSelect && !last)
      advance.current = setTimeout(() => setStep((current) => current + 1), 200);
  };
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (panels.at(-1) !== token.current) return;
    const modified = [event.altKey, event.ctrlKey, event.metaKey, event.shiftKey].some(Boolean);
    if (modified) return;
    if (typingTarget(event.target)) return;
    const index = Number(event.key) - 1;
    const option = Number.isInteger(index) ? question.options[index] : undefined;
    if (!option) return;
    event.preventDefault();
    choose(option.label);
  });
  useEffect(() => {
    const panel = token.current;
    panels.push(panel);
    const listener = (event: KeyboardEvent) => onKey(event);
    window.addEventListener("keydown", listener);
    return () => {
      window.removeEventListener("keydown", listener);
      panels.splice(panels.indexOf(panel), 1);
      clearTimeout(advance.current);
    };
  }, []);
  const selected = drafts[question.id]?.selected ?? [];
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-medium">{payload.title}</p>
        {payload.questions.length > 1 && (
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {step + 1}/{payload.questions.length}
          </span>
        )}
      </div>
      <fieldset className="grid gap-1.5" aria-describedby={`${id}-question`}>
        {question.header && (
          <legend className="text-xs font-medium text-muted-foreground uppercase">
            {question.header}
          </legend>
        )}
        <p id={`${id}-question`}>{question.question}</p>
        <div
          role={question.multiSelect ? "group" : "radiogroup"}
          aria-label={question.question}
          className="grid gap-1"
        >
          {question.options.map((option, index) => {
            const checked = selected.includes(option.label);
            return (
              <button
                key={option.label}
                type="button"
                role={question.multiSelect ? "checkbox" : "radio"}
                aria-checked={checked}
                disabled={pending}
                onClick={() => choose(option.label)}
                className={cn(
                  "flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50",
                  checked && "border-primary bg-primary/5",
                )}
              >
                {question.multiSelect ? (
                  <Checkbox checked={checked} tabIndex={-1} aria-hidden="true" className="mt-0.5" />
                ) : (
                  index < 9 && <Kbd className="mt-px">{index + 1}</Kbd>
                )}
                <span className="min-w-0">
                  <span className="block">{option.label}</span>
                  {option.description && (
                    <span className="block text-xs text-muted-foreground">
                      {option.description}
                    </span>
                  )}
                </span>
                {question.multiSelect && index < 9 && (
                  <Kbd className="mt-px ml-auto">{index + 1}</Kbd>
                )}
              </button>
            );
          })}
        </div>
        {question.allowCustom && (
          <Input
            aria-label="Type your own answer"
            placeholder="Type your own answer"
            value={drafts[question.id]?.custom ?? ""}
            disabled={pending}
            onChange={(event) =>
              update(
                setQuestionCustom(drafts[question.id], event.target.value, question.multiSelect),
              )
            }
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                next();
              }
            }}
          />
        )}
      </fieldset>
      <div className="flex gap-2">
        {step > 0 && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              clearTimeout(advance.current);
              setStep(step - 1);
            }}
          >
            Back
          </Button>
        )}
        <Button type="button" size="sm" disabled={!answered || pending} onClick={next}>
          {last ? "Submit" : "Next"}
        </Button>
      </div>
    </div>
  );
}
