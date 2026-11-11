import { useMutation, useQueryClient } from "@tanstack/react-query";

import { authError } from "@/api/auth/error";
import { authClient } from "@/lib/auth/client";
import { isDesktop } from "@/lib/desktop/auth";
import { electronQuery } from "@/lib/desktop/authorization-query";

export function useEmailLogin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      email: string;
      password: string;
      callbackURL: string;
      query: ReturnType<typeof electronQuery>;
    }) => {
      const { query, ...credentials } = input;
      const result = await authClient.signIn.email({ ...credentials, fetchOptions: { query } });
      if (result.error) {
        if (result.error.code === "EMAIL_NOT_VERIFIED") return { verificationRequired: true };
        throw authError(result.error);
      }
      client.clear();
      return { verificationRequired: false };
    },
  });
}

export function useEmailSignup() {
  return useMutation({
    mutationFn: async (input: {
      name: string;
      email: string;
      password: string;
      callbackURL: string;
    }) => {
      const result = await authClient.signUp.email({
        ...input,
        fetchOptions: { query: electronQuery(window.location.search) },
      });
      if (result.error) throw authError(result.error);
    },
  });
}

export function useRequestPasswordReset(redirectTo: string) {
  return useMutation({
    mutationFn: async (email: string) => {
      const result = await authClient.requestPasswordReset({ email, redirectTo });
      if (result.error) throw authError(result.error);
    },
  });
}

export function useResetPassword(token: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (newPassword: string) => {
      const result = await authClient.resetPassword({ token, newPassword });
      if (result.error) throw authError(result.error);
      client.clear();
    },
  });
}

export function useSendVerificationEmail(callbackURL: (email: string) => string) {
  return useMutation({
    mutationFn: async (email: string) => {
      const result = await authClient.sendVerificationEmail({
        email,
        callbackURL: callbackURL(email),
      });
      if (result.error) throw authError(result.error);
    },
  });
}

export function useSignOut() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (isDesktop()) await window.signOut!();
      else {
        const result = await authClient.signOut();
        if (result.error) throw authError(result.error);
      }
      // Clear private state before the next document replaces this one.
      await client.cancelQueries();
      client.clear();
    },
  });
}
