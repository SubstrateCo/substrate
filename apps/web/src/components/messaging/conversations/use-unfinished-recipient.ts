import { useState } from "react";

import { unfinishedRecipientMessage } from "@/lib/people/people-picker";

/**
 * Text left in the people field with id `fieldId`. A submit with text left is refused, so nothing
 * typed is dropped. `limit` explains a field that takes no more people.
 */
export function useUnfinishedRecipient(fieldId: string, limit?: string) {
  const [pendingText, setPendingText] = useState("");
  const [refused, setRefused] = useState(false);
  return {
    pendingText,
    /** The field's error after a refused submit, until the text changes. */
    message: refused ? unfinishedRecipientMessage(pendingText, limit) : undefined,
    onPendingTextChange: (text: string) => {
      setPendingText(text);
      setRefused(false);
    },
    /** Refuses a submit while text is left and focuses the field. Returns whether it refused. */
    refuse: () => {
      if (!unfinishedRecipientMessage(pendingText, limit)) return false;
      setRefused(true);
      document.getElementById(fieldId)?.focus();
      return true;
    },
  };
}
