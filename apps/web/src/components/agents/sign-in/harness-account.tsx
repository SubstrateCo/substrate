import type { HarnessAuthMethod, HarnessKind } from "@substrate/contracts/harness-runtime";

import { useQuery } from "@tanstack/react-query";

import { useState, type ReactNode } from "react";

import { HarnessAccountView, type HarnessAccountState } from "./harness-account-view";
import { SignInDialog } from "./sign-in-dialog";
import { useHarnessSignIn } from "./use-harness-sign-in";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { harnessLabel } from "@/lib/agents/harness-meta";
import { harnessBridge } from "@/lib/desktop/bridges";
import { harnessModelsQueryOptions } from "@/queries/agents/models";
import { toast } from "sonner";

export type StartSignIn = (harness: HarnessKind, method: HarnessAuthMethod) => void;

function accountState(
  catalog:
    | { status: string; auth?: { methods: HarnessAuthMethod[]; signOut: boolean } }
    | undefined,
): HarnessAccountState {
  if (!catalog?.auth) return { kind: "hidden" };
  if (catalog.status === "sign-in") return { kind: "sign-in", methods: catalog.auth.methods };
  if (catalog.status === "ready") return { kind: "signed-in", signOut: catalog.auth.signOut };
  return { kind: "hidden" };
}

export function HarnessAccount({
  agentId,
  harness,
  children,
}: {
  agentId?: string;
  harness: HarnessKind;
  children: (signIn: StartSignIn | undefined) => ReactNode;
}) {
  const { userId, organizationId } = useWorkspaceScope();
  const desktop = !!harnessBridge();
  const catalog = useQuery({
    ...harnessModelsQueryOptions(userId, organizationId, harness, agentId),
    enabled: desktop,
  });
  const signIn = useHarnessSignIn(userId, organizationId, desktop);
  const { signOut } = signIn;
  const [signingOut, setSigningOut] = useState(false);
  const label = harnessLabel(harness);
  return (
    <>
      {children(desktop ? signIn.begin : undefined)}
      <HarnessAccountView
        label={label}
        state={desktop ? accountState(catalog.data) : { kind: "hidden" }}
        busy={signIn.open || signOut.isPending}
        onSignIn={(method) => signIn.begin(harness, method)}
        onSignOut={() => setSigningOut(true)}
      />
      {signIn.open && signIn.dialogState && (
        <SignInDialog
          label={signIn.activeLabel}
          state={signIn.dialogState}
          error={signIn.error}
          sending={signIn.sending}
          onSend={signIn.send}
          onCancel={signIn.stop}
          onRetry={signIn.retry}
          onClose={signIn.close}
        />
      )}
      {signingOut && (
        <ConfirmDialog
          title={`Disconnect ${label}?`}
          description={`Agents on this desktop that use ${label} stop working until you connect it again.`}
          confirmLabel={`Disconnect ${label}`}
          errorDescription={`Couldn’t disconnect ${label}. Try again.`}
          destructive
          pending={signOut.isPending}
          error={signOut.error}
          onConfirm={() =>
            signOut.mutate(harness, {
              onSuccess: () => {
                toast.success(`${label} disconnected`);
                setSigningOut(false);
              },
            })
          }
          onClose={() => {
            setSigningOut(false);
            signOut.reset();
          }}
        />
      )}
    </>
  );
}
