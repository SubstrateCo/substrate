import { useQuery } from "@tanstack/react-query";

import { BrowserElectronReturn } from "../desktop/browser-electron-return";
import { formText } from "../form-values";
import { LoginForm } from "@/components/auth/login/login-form-view";
import { authHref } from "@/lib/auth/browser-links";
import { safeRedirect } from "@/lib/auth/navigation";
import { electronQuery } from "@/lib/desktop/authorization-query";
import { useEmailLogin } from "@/queries/auth/mutations";
import { sessionQueryOptions } from "@/queries/auth/session";

export function BrowserLoginForm({ redirect, email }: { redirect: string; email: string }) {
  const query = electronQuery(window.location.search);
  // Only the desktop handoff returns early for an existing browser session.
  const session = useQuery({ ...sessionQueryOptions(), enabled: !!query });
  const login = useEmailLogin();
  if (query && (login.isSuccess || session.data?.user.emailVerified))
    return (
      <BrowserElectronReturn
        redirect={redirect}
        email={session.data?.user.email ?? login.variables?.email}
      />
    );
  return (
    <LoginForm
      email={email}
      pending={login.isPending}
      error={login.error}
      onSubmit={(form) =>
        login.mutate(
          {
            email: formText(form, "email"),
            password: formText(form, "password"),
            callbackURL: query ? authHref("/login", redirect) : safeRedirect(redirect),
            query,
          },
          {
            onSuccess: (result, input) => {
              if (result.verificationRequired) {
                window.location.assign(authHref("/verify-email", redirect, input.email));
                return;
              }
              if (!query) window.location.assign(safeRedirect(redirect));
            },
          },
        )
      }
      forgotPasswordHref={authHref("/forgot-password", redirect)}
      signupHref={authHref("/signup", redirect)}
    />
  );
}
