import { useMutation } from "@tanstack/react-query";

import { authDestination } from "./navigation";
import { authResult } from "./result";
import type { AuthMode } from "./types";
import { authClient } from "@/api/auth-client";
import { authCallback } from "@/auth/actions";
import { useAuth } from "@/auth/provider";

export function useAuthFlow({
  mode,
  token,
  destination,
  invitationId,
  onAuthenticated,
}: {
  mode: AuthMode;
  token?: string;
  destination?: string;
  invitationId?: string;
  onAuthenticated?: (destination?: string) => void;
}) {
  const { refresh } = useAuth();
  const callbackURL = (path: string, email?: string) => {
    const params = new URLSearchParams();
    const safeDestination = authDestination(destination);
    if (safeDestination) params.set("destination", safeDestination);
    if (invitationId) params.set("invitationId", invitationId);
    if (email) params.set("email", email.trim());
    return authCallback(`/${path}${params.size ? `?${params}` : ""}`);
  };
  return useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      if (mode === "forgot") {
        const result = await authClient.requestPasswordReset({
          email: email.trim(),
          redirectTo: callbackURL("reset-password", email),
        });
        if (result.error) throw new Error(result.error.message || "Couldn't send a reset link.");
        return "sent" as const;
      }
      if (mode === "reset") {
        if (!token) throw new Error("This reset link is incomplete. Request a new one.");
        const result = await authClient.resetPassword({ token, newPassword: password });
        if (result.error) throw new Error(result.error.message || "Couldn't reset your password.");
        await refresh();
        return "reset" as const;
      }
      if (mode === "verify") {
        if (token) {
          const result = await authClient.verifyEmail({ query: { token } });
          if (result.error)
            throw new Error(result.error.message || "This verification link is no longer valid.");
          await refresh();
          const session = await authClient.getSession();
          if (session.data?.user.emailVerified) return "authenticated" as const;
          return "verified" as const;
        }
        const result = await authClient.sendVerificationEmail({
          email: email.trim(),
          callbackURL: callbackURL("login", email),
        });
        if (result.error)
          throw new Error(result.error.message || "Couldn't send a verification email.");
        return "sent" as const;
      }
      const result = await authClient.signIn.email({ email: email.trim(), password });
      if (result.error?.code === "EMAIL_NOT_VERIFIED") return "verify" as const;
      if (result.error) throw new Error(result.error.message || "Couldn't sign in.");
      const session = authResult(await authClient.getSession());
      if (!session.user.emailVerified) return "verify" as const;
      await refresh();
      return "authenticated" as const;
    },
    onSuccess: (result) => {
      if (result !== "authenticated") return;
      const invitationDestination = invitationId
        ? authDestination(`/accept-invitation/${invitationId}`)
        : undefined;
      onAuthenticated?.(authDestination(destination) ?? invitationDestination);
    },
  });
}
