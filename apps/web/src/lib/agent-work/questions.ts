import type { AgentRequestPayload, AgentRequestResponse } from "@substrate/contracts/agent-work";

type Questions = Extract<AgentRequestPayload, { type: "questions" }>["questions"];
export type QuestionDraft = { selected: string[]; custom: string };

/** Selected options first, then the typed answer. Empty answers are left out. */
export function questionAnswer(draft: QuestionDraft | undefined) {
  const custom = draft?.custom.trim();
  return [...(draft?.selected ?? []), ...(custom ? [custom] : [])];
}

export function questionsResponse(
  questions: Questions,
  drafts: Partial<Record<string, QuestionDraft>>,
): Extract<AgentRequestResponse, { type: "questions" }> {
  return {
    type: "questions",
    answers: Object.fromEntries(
      questions.map((question) => [question.id, questionAnswer(drafts[question.id])]),
    ),
  };
}

/** Single-select replaces the choice. Multi-select toggles it. */
export function toggleQuestionOption(
  draft: QuestionDraft | undefined,
  label: string,
  multiSelect: boolean,
): QuestionDraft {
  const selected = draft?.selected ?? [];
  if (!multiSelect) return { selected: [label], custom: "" };
  return {
    selected: selected.includes(label)
      ? selected.filter((item) => item !== label)
      : [...selected, label],
    custom: draft?.custom ?? "",
  };
}

/** A typed answer replaces a single-select choice. */
export function setQuestionCustom(
  draft: QuestionDraft | undefined,
  custom: string,
  multiSelect: boolean,
): QuestionDraft {
  return { selected: multiSelect ? (draft?.selected ?? []) : [], custom };
}
