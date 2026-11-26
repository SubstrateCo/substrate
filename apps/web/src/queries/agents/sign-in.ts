import type { HarnessKind, HarnessSignInState } from "@substrate/contracts/harness";

import { queryOptions, skipToken, useMutation, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { harnessBridge, withHarnessSession } from "@/lib/desktop/bridges";

/** The renderer keeps at most this much sign-in output. */
const outputLimit = 200_000;
const pollMs = 500;

/** Joins the next read onto the output read so far. */
function appendSignInOutput(
  previous: HarnessSignInState | undefined,
  next: HarnessSignInState,
): HarnessSignInState {
  const output = (previous?.output ?? "") + next.output;
  return { ...next, output: output.length > outputLimit ? output.slice(-outputLimit) : output };
}

/**
 * A running sign-in's status and output. Polls while it runs; each read continues from the last
 * cursor, so output accumulates in the cache.
 */
export function harnessSignInQueryOptions(
  userId: string,
  organizationId: string,
  loginId: string | undefined,
  previous: () => HarnessSignInState | undefined,
) {
  return queryOptions({
    queryKey: queryKeys.harnessSignIn(userId, organizationId, loginId ?? ""),
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchInterval: (query) => (query.state.data?.status === "running" ? pollMs : false),
    queryFn: loginId
      ? async () => {
          const bridge = harnessBridge();
          if (!bridge) throw new Error("Open Substrate on your desktop to sign in.");
          const last = previous();
          const next = await bridge.readSignIn({ loginId, cursor: last?.cursor ?? 0 });
          return appendSignInOutput(last, next);
        }
      : skipToken,
  });
}

/** Start, answer, and cancel a sign-in, and sign out. Success refreshes every model catalog. */
export function useHarnessSignInMutations(userId: string, organizationId: string) {
  const client = useQueryClient();
  const refreshCatalogs = () =>
    client.invalidateQueries({ queryKey: queryKeys.allHarnessModels(userId) });
  const start = useMutation({
    mutationFn: (input: { harness: HarnessKind; methodId: string }) =>
      withHarnessSession(organizationId, (bridge) => bridge.signIn(input)),
    onSuccess: (state) =>
      client.setQueryData(queryKeys.harnessSignIn(userId, organizationId, state.loginId), state),
  });
  // Input and cancelling change the sign-in's output and status; read them now, not at the next poll.
  const signInKey = (loginId: string) => queryKeys.harnessSignIn(userId, organizationId, loginId);
  const send = useMutation({
    mutationFn: (input: { loginId: string; text: string }) =>
      withHarnessSession(organizationId, (bridge) => bridge.sendSignInInput(input)),
    onSuccess: (_, input) => client.invalidateQueries({ queryKey: signInKey(input.loginId) }),
  });
  const cancel = useMutation({
    mutationFn: (loginId: string) =>
      withHarnessSession(organizationId, (bridge) => bridge.cancelSignIn({ loginId })),
    onSuccess: (_, loginId) => client.invalidateQueries({ queryKey: signInKey(loginId) }),
  });
  const signOut = useMutation({
    mutationFn: (harness: HarnessKind) =>
      withHarnessSession(organizationId, (bridge) => bridge.signOut({ harness })),
    onSuccess: refreshCatalogs,
  });
  return { start, send, cancel, signOut, refreshCatalogs };
}
