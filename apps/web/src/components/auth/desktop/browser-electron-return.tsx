import { useEffect, useState } from "react";

import { BrowserElectronReturn as BrowserElectronReturnView } from "@/components/auth/desktop/browser-electron-return-view";
import { SignOutButton } from "@/components/auth/sign-out/sign-out-button";
import { useElectronAuthorization } from "@/hooks/use-auth-href";
import { authClient } from "@/lib/auth/client";
import { useElectronTransfer } from "@/queries/auth/desktop-mutations";

export function BrowserElectronReturn({ redirect, email }: { redirect: string; email?: string }) {
  const [attempt, setAttempt] = useState(0);
  const transfer = useElectronTransfer();
  const query = useElectronAuthorization();
  useEffect(() => {
    const id = authClient.ensureElectronRedirect({ timeout: 300_000 });
    return () => clearInterval(id);
  }, [attempt]);
  return (
    <BrowserElectronReturnView
      email={email}
      signOut={<SignOutButton destination={redirect} />}
      pending={transfer.isPending}
      error={transfer.error}
      onContinue={() =>
        transfer.mutate(query, { onSuccess: () => setAttempt((value) => value + 1) })
      }
    />
  );
}
