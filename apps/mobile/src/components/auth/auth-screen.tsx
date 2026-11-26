import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";

import { AuthField } from "./auth-field";
import { AuthFrame } from "./auth-frame";
import { AuthNotice } from "./auth-notice";
import { SubmitButton } from "./submit-button";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { errorMessage } from "@/features/auth/result";
import type { AuthMode, AuthScreenProps } from "@/features/auth/types";
import { useAuthFlow } from "@/features/auth/use-auth-flow";
import { ArrowLeft } from "lucide-react-native";

const copy: Record<AuthMode, { title: string; description: string; action: string }> = {
  login: {
    title: "Welcome back",
    description: "Sign in to your connected workspace.",
    action: "Sign in",
  },
  invite: {
    title: "Your team is waiting",
    description: "Sign in with the email address that received the invitation.",
    action: "Sign in to continue",
  },
  verify: {
    title: "Check your inbox",
    description: "Verify your email before opening a workspace.",
    action: "Resend verification email",
  },
  forgot: {
    title: "Forgot your password?",
    description: "We'll email you a link to set a new password.",
    action: "Send reset link",
  },
  reset: {
    title: "A fresh start",
    description: "Choose a new password for your account.",
    action: "Reset password",
  },
};

export function AuthScreen({
  mode: initialMode = "login",
  token,
  error: linkError,
  email: initialEmail = "",
  invitationId,
  destination,
  onAuthenticated,
  onModeChange,
}: AuthScreenProps) {
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [validation, setValidation] = useState("");
  const [completed, setCompleted] = useState<"sent" | "reset" | "verified">();
  const [previousMode, setPreviousMode] = useState(initialMode);
  const [previousEmail, setPreviousEmail] = useState(initialEmail);
  const verificationStarted = useRef<string | undefined>(undefined);
  const flow = useAuthFlow({
    mode,
    token: linkError ? undefined : token,
    destination,
    invitationId,
    onAuthenticated,
  });
  const { mutate, reset } = flow;
  const changeMode = useCallback(
    (next: AuthMode) => {
      reset();
      setValidation("");
      setCompleted(undefined);
      setPassword("");
      setMode(next);
      onModeChange?.(next, email.trim());
    },
    [reset, onModeChange, email],
  );
  if (previousMode !== initialMode) {
    setPreviousMode(initialMode);
    if (mode !== initialMode) {
      setMode(initialMode);
      setValidation("");
      setCompleted(undefined);
      setPassword("");
    }
  }
  if (previousEmail !== initialEmail) {
    setPreviousEmail(initialEmail);
    setEmail(initialEmail);
  }

  const run = useCallback(() => {
    mutate(
      { email, password },
      {
        onSuccess: (result) => {
          setPassword("");
          if (result === "verify") {
            changeMode("verify");
          } else if (result !== "authenticated") {
            setCompleted(result);
          }
        },
      },
    );
  }, [mutate, email, password, changeMode]);
  // A verification token is consumed once, never retried in a render loop.
  useEffect(() => {
    if (mode !== "verify" || !token || linkError) return;
    if (verificationStarted.current === token) return;
    verificationStarted.current = token;
    run();
  }, [mode, token, linkError, run]);

  const hasPassword = ["login", "invite", "reset"].includes(mode);
  const hasEmail = mode !== "reset" && !(mode === "verify" && token && !linkError);
  let success: string | undefined;
  if (completed === "sent") {
    success =
      mode === "forgot"
        ? "If an account exists for this address, a reset link is on its way."
        : "Verification email sent. Open the link in your inbox to continue.";
  } else if (completed === "reset") {
    success = "Your password has been reset. Sign in with your new password.";
  } else if (completed === "verified") {
    success = "Your email is verified. Sign in to continue.";
  }
  const submit = () => {
    setValidation("");
    if (hasEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setValidation("Enter a valid email address.");
      return;
    }
    if (hasPassword && !password) {
      setValidation("Enter your password.");
      return;
    }
    if (mode === "reset" && password.length < 8) {
      setValidation("Use at least 8 characters for your password.");
      return;
    }
    run();
  };
  const finished = completed === "reset" || completed === "verified";
  const invalidReset = mode === "reset" && (!token || !!linkError);
  const current = copy[mode];
  return (
    <AuthFrame title={current.title} description={current.description}>
      <View className="gap-5">
        {invitationId && mode !== "invite" ? (
          <Text className="rounded-lg bg-muted px-3 py-3 text-sm text-muted-foreground">
            Your workspace invitation will be here when you finish.
          </Text>
        ) : null}
        <AuthNotice message={validation || (flow.error ? errorMessage(flow.error) : undefined)} />
        {linkError && mode !== "reset" ? (
          <AuthNotice message="This email link is no longer valid. Request a new link or sign in to continue." />
        ) : null}
        <AuthNotice message={success} success />
        {invalidReset ? (
          <AuthNotice message="This reset link is incomplete or no longer valid. Request a new link to continue." />
        ) : null}
        {!finished && !invalidReset ? (
          <>
            {hasEmail ? (
              <AuthField
                label="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                autoComplete="email"
                editable={!flow.isPending}
              />
            ) : null}
            {hasPassword ? (
              <AuthField
                label={mode === "reset" ? "New password" : "Password"}
                password
                value={password}
                onChangeText={setPassword}
                autoComplete={mode === "reset" ? "new-password" : "current-password"}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!flow.isPending}
                returnKeyType="go"
                onSubmitEditing={submit}
              />
            ) : null}
            {mode === "reset" ? (
              <Text className="-mt-3 text-sm text-muted-foreground">
                Use at least 8 characters.
              </Text>
            ) : null}
            <SubmitButton
              busy={flow.isPending}
              label={mode === "verify" && token && !linkError ? "Verify email" : current.action}
              onPress={submit}
            />
          </>
        ) : null}
        {mode === "login" || mode === "invite" ? (
          <>
            <Button variant="ghost" disabled={flow.isPending} onPress={() => changeMode("forgot")}>
              <Text>Forgot password?</Text>
            </Button>
          </>
        ) : (
          <View className="gap-2">
            {invalidReset ? (
              <Button onPress={() => changeMode("forgot")}>
                <Text>Request a new link</Text>
              </Button>
            ) : null}
            <Button
              variant="ghost"
              className="flex-row gap-2"
              disabled={flow.isPending}
              onPress={() => changeMode(invitationId ? "invite" : "login")}
            >
              <Icon as={ArrowLeft} size={16} className="text-muted-foreground" />
              <Text>Back to sign in</Text>
            </Button>
          </View>
        )}
      </View>
    </AuthFrame>
  );
}
