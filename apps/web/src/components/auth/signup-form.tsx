import { useMutation, useQueryClient } from "@tanstack/react-query";
import { SignupForm as SignupFormView } from "@startup-os/ui/auth/signup-form";
import { authClient } from "@/lib/auth-client";
import { authHref } from "@/lib/auth-navigation";
import { formText } from "./form-values";

export function SignupForm({ redirect }: { redirect: string }) {
  const queryClient = useQueryClient();
  const signup = useMutation({
    mutationFn: async (form: FormData) => {
      const email = formText(form, "email");
      const result = await authClient.signUp.email({
        name: formText(form, "name"),
        email,
        password: formText(form, "password"),
        callbackURL: authHref("/login", redirect, email),
      });
      if (result.error) throw new Error(result.error.message || "Could not create your account.");
      queryClient.clear();
      window.location.assign(authHref("/verify-email", redirect, email));
    },
  });
  return (
    <SignupFormView
      pending={signup.isPending}
      error={signup.error}
      onSubmit={(form) => signup.mutate(form)}
      loginHref={authHref("/login", redirect)}
    />
  );
}
