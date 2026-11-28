import { useState } from "react";

import type { ReferenceOption } from "./reference-picker-view";
import {
  activeReferenceQuery,
  insertReference,
  type DraftPart,
} from "@/features/messaging/references/token-draft";

export function useReferenceEditing(
  parts: readonly DraftPart[],
  setParts: (next: DraftPart[]) => void,
) {
  const [caret, setCaret] = useState(0);
  const [caretRequest, setCaretRequest] = useState<{ id: number; caret: number }>();
  const query = activeReferenceQuery(parts, caret);
  const pick = (option: ReferenceOption) => {
    if (!query) return;
    const inserted = insertReference(parts, query, {
      kind: option.kind,
      id: option.id,
      label: option.title,
    });
    setParts(inserted.parts);
    setCaret(inserted.caret);
    setCaretRequest((previous) => ({ id: (previous?.id ?? 0) + 1, caret: inserted.caret }));
  };
  return { query, caretRequest, setCaret, pick };
}
