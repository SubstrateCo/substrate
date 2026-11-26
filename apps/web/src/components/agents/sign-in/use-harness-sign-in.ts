import type { HarnessAuthMethod, HarnessKind } from "@substrate/contracts/harness";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useEffect, useState } from "react";

import type { SignInDialogState } from "./sign-in-dialog";
import { harnessLabel } from "@/lib/agents/harness-meta";
import { harnessSignInQueryOptions, useHarnessSignInMutations } from "@/queries/agents/sign-in";
import { toast } from "sonner";

type ActiveSignIn = { harness: HarnessKind; method: HarnessAuthMethod; loginId?: string };

/** One sign-in at a time on this desktop: start, follow its output, answer, and cancel it. */
export function useHarnessSignIn(userId: string, org: string, desktop: boolean) {
  const client = useQueryClient();
  const { start, send, cancel, signOut, refreshCatalogs } = useHarnessSignInMutations(userId, org);
  const [active, setActive] = useState<ActiveSignIn>();
  const progressOptions = harnessSignInQueryOptions(userId, org, active?.loginId, () =>
    client.getQueryData(progressOptions.queryKey),
  );
  const progress = useQuery({ ...progressOptions, enabled: desktop && !!active?.loginId });
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

  // A finished sign-in keeps `active` until the next one starts, but has no dialog.
  const dialogState: SignInDialogState | undefined =
    active && open
      ? {
          type: active.method.type,
          status: start.isError || progress.isError ? "failed" : (status ?? "starting"),
          output: progress.data?.output ?? "",
        }
      : undefined;
  return {
    open,
    activeLabel,
    dialogState,
    error: start.error ?? progress.error ?? send.error,
    sending: send.isPending,
    signOut,
    begin,
    stop,
    send: async (text: string) => {
      if (active?.loginId) await send.mutateAsync({ loginId: active.loginId, text });
    },
    retry: () => {
      if (active) begin(active.harness, active.method);
    },
    close: () => {
      setActive(undefined);
      start.reset();
    },
  };
}
