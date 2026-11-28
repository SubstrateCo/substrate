import { useState } from "react";

import { unfinishedRecipientMessage } from "@/lib/people/people-picker";

export function useUnfinishedRecipient(fieldId: string, limit?: string) {
  const [pendingText, setPendingText] = useState("");
  const [refused, setRefused] = useState(false);
  return {
    pendingText,
    message: refused ? unfinishedRecipientMessage(pendingText, limit) : undefined,
    onPendingTextChange: (text: string) => {
      setPendingText(text);
      setRefused(false);
    },
    refuse: () => {
      if (!unfinishedRecipientMessage(pendingText, limit)) return false;
      setRefused(true);
      document.getElementById(fieldId)?.focus();
      return true;
    },
  };
}
