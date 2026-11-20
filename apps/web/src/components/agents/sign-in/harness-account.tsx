import type {
  HarnessAuthMethod,
  HarnessKind,
  HarnessSignInState,
} from "@substrate/contracts/harness";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useEffect, useState, type ReactNode } from "react";

import { HarnessAccountView, type HarnessAccountState } from "./harness-account-view";
import { SignInDialog, type SignInDialogState } from "./sign-in-dialog";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { harnessLabel } from "@/lib/agents/harness-meta";
import { harnessBridge } from "@/lib/desktop/bridges";
import { harnessModelsQueryOptions } from "@/queries/agents/models";
import { harnessSignInQueryOptions, useHarnessSignInMutations } from "@/queries/agents/sign-in";
import { queryKeys } from "@/queries/keys";
import { toast } from "sonner";

type ActiveSignIn = { harness: HarnessKind; method: HarnessAuthMethod; loginId?: string };

/** Starts a sign-in for a harness with one of its advertised methods. */
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

/**
 * Sign-in and sign-out for the agent's harness on this desktop. children receive a launcher, so
 * the model picker can start a sign-in for the harness it shows; the dialog lives here, outside
 * the picker's popover.
 */
export function HarnessAccount({
  userId,
  organizationId,
  agentId,
  harness,
  children,
}: {
  userId: string;
  organizationId?: string | null;
  agentId?: string;
  harness: HarnessKind;
  children: (signIn: StartSignIn | undefined) => ReactNode;
}) {
  const desktop = !!harnessBridge() && !!organizationId;
  const org = organizationId ?? "";
  const client = useQueryClient();
  const catalog = useQuery({
    ...harnessModelsQueryOptions(userId, org, harness, agentId),
    enabled: desktop,
  });
  const { start, send, cancel, signOut, refreshCatalogs } = useHarnessSignInMutations(userId, org);
  const [active, setActive] = useState<ActiveSignIn>();
  const [signingOut, setSigningOut] = useState(false);
  const signInKey = queryKeys.harnessSignIn(userId, org, active?.loginId ?? "");
  const progress = useQuery({
    ...harnessSignInQueryOptions(userId, org, active?.loginId, () =>
      client.getQueryData<HarnessSignInState>(signInKey),
    ),
    enabled: desktop && !!active?.loginId,
  });
  const status = progress.data?.status;
  const activeLabel = active ? harnessLabel(active.harness) : "";

  // A finished sign-in closes its dialog; the catalogs and the toast follow the agent's answer.
  const open = !!active && status !== "succeeded";
  useEffect(() => {
    if (status !== "succeeded") return;
    void refreshCatalogs();
    toast.success(`${activeLabel} account connected`);
  }, [status, activeLabel, refreshCatalogs]);

  function begin(nextHarness: HarnessKind, method: HarnessAuthMethod) {
    send.reset();
    cancel.reset();
    setActive({ harness: nextHarness, method });
    start.mutate(
      { harness: nextHarness, methodId: method.id },
      {
        onSuccess: (state) =>
          setActive((current) =>
            current?.method.id === method.id ? { ...current, loginId: state.loginId } : current,
          ),
      },
    );
  }

  function stop() {
    if (active?.loginId) cancel.mutate(active.loginId);
    setActive(undefined);
    start.reset();
  }

  const dialogState: SignInDialogState | undefined = active && {
    type: active.method.type,
    status: start.isError || progress.isError ? "failed" : (status ?? "starting"),
    output: progress.data?.output ?? "",
  };
  const label = harnessLabel(harness);
  return (
    <>
      {children(desktop ? begin : undefined)}
      <HarnessAccountView
        label={label}
        state={desktop ? accountState(catalog.data) : { kind: "hidden" }}
        busy={open || signOut.isPending}
        onSignIn={(method) => begin(harness, method)}
        onSignOut={() => setSigningOut(true)}
      />
      {open && dialogState && (
        <SignInDialog
          label={activeLabel}
          state={dialogState}
          error={start.error ?? progress.error ?? send.error}
          sending={send.isPending}
          onSend={async (text) => {
            if (active.loginId) await send.mutateAsync({ loginId: active.loginId, text });
          }}
          onCancel={stop}
          onRetry={() => begin(active.harness, active.method)}
          onClose={() => {
            setActive(undefined);
            start.reset();
          }}
        />
      )}
      {signingOut && (
        <ConfirmDialog
          title={`Disconnect ${label}?`}
          description={`Agents on this desktop that use ${label} stop working until you connect it again.`}
          confirmLabel={`Disconnect ${label}`}
          pendingLabel="Disconnecting"
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
