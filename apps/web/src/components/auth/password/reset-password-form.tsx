import { useMutation, useQueryClient } from "@tanstack/react-query";

import { formText } from "../form-values";
import { authError } from "@/api/auth/error";
import { ResetPasswordForm as ResetPasswordFormView } from "@/components/auth/password/reset-password-form-view";
import { authHref } from "@/lib/auth/browser-links";
import { authClient } from "@/lib/auth/client";

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
      const result = await authClient.resetPassword({
        token,
        newPassword: formText(form, "password"),
      });
      if (result.error) throw authError(result.error);
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
