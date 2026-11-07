import { useMutation } from "@tanstack/react-query";

import { useEffect, useState } from "react";

import { BrowserElectronReturn as BrowserElectronReturnView } from "@/components/auth/desktop/browser-electron-return-view";
import { authClient } from "@/lib/auth/client";
import { electronQuery } from "@/lib/desktop/authorization-query";

export function BrowserElectronReturn() {
  const [attempt, setAttempt] = useState(0);
  const transfer = useMutation({
    mutationFn: async () => {
      const query = electronQuery(window.location.search);
      if (!query) throw new Error("Open sign-in from Startup OS to try again.");
      const result = await authClient.electron.transferUser({ fetchOptions: { query } });
      if (result.error) throw new Error("Could not return to Startup OS. Please try again.");
    },
    onSuccess: () => setAttempt((value) => value + 1),
  });
  useEffect(() => {
    const id = authClient.ensureElectronRedirect({ timeout: 300_000 });
    return () => clearInterval(id);
  }, [attempt]);
  return (
    <BrowserElectronReturnView
      pending={transfer.isPending}
      error={transfer.error}
      onContinue={() => transfer.mutate()}
    />
  );
}
