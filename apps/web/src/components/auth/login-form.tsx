import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LoginForm as LoginFormView } from "@startup-os/ui/auth/login-form";
import { authClient } from "@/lib/auth-client";
import { authHref, safeRedirect } from "@/lib/auth-navigation";
import { formText } from "./form-values";

export function LoginForm({ redirect, email = "" }: { redirect: string; email?: string }) {
  const queryClient = useQueryClient();
  const login = useMutation({
    mutationFn: async (form: FormData) => {
      const email = formText(form, "email");
      const result = await authClient.signIn.email({
        email,
        password: formText(form, "password"),
        callbackURL: safeRedirect(redirect),
      });
      if (result.error) {
        if (result.error.code === "EMAIL_NOT_VERIFIED") {
          window.location.assign(authHref("/verify-email", redirect, email));
          return;
        }
        throw new Error(result.error.message || "Could not sign in.");
      }
      queryClient.clear();
      window.location.assign(safeRedirect(redirect));
    },
  });
  return (
    <LoginFormView
      email={email}
      pending={login.isPending}
      error={login.error}
      onSubmit={(form) => login.mutate(form)}
      forgotPasswordHref={authHref("/forgot-password", redirect)}
      signupHref={authHref("/signup", redirect)}
    />
  );
}
