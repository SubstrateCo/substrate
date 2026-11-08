import { useMutation } from "@tanstack/react-query";

import { formText } from "../form-values";
import { SignupForm } from "@/components/auth/signup/signup-form-view";
import { authHref } from "@/lib/auth/browser-links";
import { authClient } from "@/lib/auth/client";
import { electronQuery } from "@/lib/desktop/authorization-query";

export function BrowserSignupForm({ redirect }: { redirect: string }) {
  const signup = useMutation({
    mutationFn: async (form: FormData) => {
      const email = formText(form, "email");
      const result = await authClient.signUp.email({
        name: formText(form, "name"),
        email,
        password: formText(form, "password"),
        callbackURL: authHref("/login", redirect, email),
        fetchOptions: { query: electronQuery(window.location.search) },
      });
      if (result.error) throw new Error(result.error.message || "Could not create your account.");
      window.location.assign(authHref("/verify-email", redirect, email));
    },
  });
  return (
    <SignupForm
      pending={signup.isPending}
      error={signup.error}
      onSubmit={(form) => signup.mutate(form)}
      loginHref={authHref("/login", redirect)}
    />
  );
}
