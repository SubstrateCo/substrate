import { useEffect } from "react";

import { BrowserElectronReturn as BrowserElectronReturnView } from "@/components/auth/desktop/browser-electron-return-view";
import { SignOutButton } from "@/components/auth/sign-out/sign-out-button";
import { useElectronAuthorization } from "@/hooks/use-auth-href";
import { ensureElectronRedirect, useElectronTransfer } from "@/queries/auth/desktop-mutations";

export function BrowserElectronReturn({ redirect, email }: { redirect: string; email?: string }) {
  const transfer = useElectronTransfer();
  const query = useElectronAuthorization();
  const transferred = transfer.isSuccess ? transfer.submittedAt : 0;
  // oxlint-disable-next-line react/exhaustive-effect-dependencies -- Each successful transfer restarts the wait for the desktop app.
  useEffect(() => ensureElectronRedirect(), [transferred]);
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
