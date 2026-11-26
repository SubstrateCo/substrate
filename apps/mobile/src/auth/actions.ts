import { Platform } from "react-native";

import { authClient } from "../api/auth-client";
import { mobileOrigin } from "../api/config";

export function authCallback(path: string) {
  return Platform.OS === "web"
    ? new URL(path, globalThis.location.origin).toString()
    : `${mobileOrigin}${path.replace(/^\//, "")}`;
}

export const signIn = (email: string, password: string) =>
  authClient.signIn.email({ email, password, callbackURL: authCallback("/") });
export const sendVerificationEmail = (email: string) =>
  authClient.sendVerificationEmail({ email, callbackURL: authCallback("/verify-email") });
export const verifyEmail = (token: string) => authClient.verifyEmail({ query: { token } });
export const requestPasswordReset = (email: string) =>
  authClient.requestPasswordReset({ email, redirectTo: authCallback("/reset-password") });
export const resetPassword = (token: string, newPassword: string) =>
  authClient.resetPassword({ token, newPassword });

// Organization creation, selection, membership and invitations use Better Auth's protocol.
export const organizations = authClient.organization;
