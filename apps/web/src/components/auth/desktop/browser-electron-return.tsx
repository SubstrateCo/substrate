import { useEffect } from "react";

import { BrowserElectronReturn as BrowserElectronReturnView } from "@/components/auth/desktop/browser-electron-return-view";
import { SignOutButton } from "@/components/auth/sign-out/sign-out-button";
import { useElectronAuthorization } from "@/hooks/use-auth-href";
import { authClient } from "@/lib/auth/client";
import { useElectronTransfer } from "@/queries/auth/desktop-mutations";

export function BrowserElectronReturn({ redirect, email }: { redirect: string; email?: string }) {
  const transfer = useElectronTransfer();
  const query = useElectronAuthorization();
  // Each successful transfer starts a new wait for the desktop app to take the session.
  const transferred = transfer.isSuccess ? transfer.submittedAt : 0;
  useEffect(() => {
    const id = authClient.ensureElectronRedirect({ timeout: 300_000 });
    return () => clearInterval(id);
  }, [transferred]);
  return (
    <BrowserElectronReturnView
      email={email}
      signOut={<SignOutButton destination={redirect} />}
      pending={transfer.isPending}
      error={transfer.error}
      onContinue={() => transfer.mutate(query)}
    />
  );
}
