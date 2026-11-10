import { useMutation } from "@tanstack/react-query";

import { formText } from "../form-values";
import { ForgotPasswordForm as ForgotPasswordFormView } from "@/components/auth/password/forgot-password-form-view";
import { authHref } from "@/lib/auth/browser-links";
import { authClient } from "@/lib/auth/client";

export function ForgotPasswordForm({ redirect }: { redirect: string }) {
  const reset = useMutation({
    mutationFn: async (form: FormData) => {
      const result = await authClient.requestPasswordReset({
        email: formText(form, "email"),
        redirectTo: authHref("/reset-password", redirect),
      });
      if (result.error)
        throw new Error(result.error.message || "Could not request a password reset.");
    },
  });
  return (
    <ForgotPasswordFormView
      pending={reset.isPending}
      success={reset.isSuccess}
      error={reset.error}
      onSubmit={(form) => reset.mutate(form)}
      onReset={() => reset.reset()}
      loginHref={authHref("/login", redirect)}
    />
  );
}
