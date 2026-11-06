import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ResetPasswordForm as ResetPasswordFormView } from "@/ui/auth/reset-password-form";
import { authClient } from "@/lib/auth-client";
import { authHref } from "@/lib/browser-auth-links";
import { formText } from "./form-values";

export function ResetPasswordForm({
  token,
  error,
  redirect,
}: {
  token: string;
  error: string;
  redirect: string;
}) {
  const queryClient = useQueryClient();
  const reset = useMutation({
    mutationFn: async (form: FormData) => {
      if (formText(form, "password") !== formText(form, "confirm"))
        throw new Error("The passwords do not match.");
      const result = await authClient.resetPassword({
        token,
        newPassword: formText(form, "password"),
      });
      if (result.error)
        throw new Error(
          result.error.message || "This reset link is invalid or expired. Request a new link.",
        );
      queryClient.clear();
    },
  });
  return (
    <ResetPasswordFormView
      invalid={!token || Boolean(error)}
      pending={reset.isPending}
      success={reset.isSuccess}
      error={reset.error}
      onSubmit={(form) => reset.mutate(form)}
      loginHref={authHref("/login", redirect)}
      requestResetHref={authHref("/forgot-password", redirect)}
    />
  );
}
