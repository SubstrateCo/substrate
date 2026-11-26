import type { DraftPart } from "@/features/messaging/references/token-draft";

export type ReferenceEditorProps = {
  parts: DraftPart[];
  label: string;
  placeholder: string;
  editable: boolean;
  caretRequest?: { id: number; caret: number };
  className?: string;
  onChange: (parts: DraftPart[]) => void;
  onCaret: (caret: number) => void;
};
