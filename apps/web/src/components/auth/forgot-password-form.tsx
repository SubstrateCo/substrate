import { useMutation } from "@tanstack/react-query";
import { ForgotPasswordForm as ForgotPasswordFormView } from "@/ui/auth/forgot-password-form";
import { authClient } from "@/lib/auth-client";
import { authHref } from "@/lib/browser-auth-links";
import { formText } from "./form-values";

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
      loginHref={authHref("/login", redirect)}
    />
  );
}
