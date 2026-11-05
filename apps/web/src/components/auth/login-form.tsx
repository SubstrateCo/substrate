import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { authHref, safeRedirect } from "@/lib/auth-navigation";
import { AuthFrame } from "./auth-frame";
import { FormMessage } from "./form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    <AuthFrame title="Welcome back" description="Sign in to your workspace.">
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          login.mutate(new FormData(event.currentTarget));
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={email}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        <FormMessage error={login.error} />
        <Button className="w-full" disabled={login.isPending}>
          {login.isPending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <div className="flex justify-between gap-4 text-sm">
        <a className="underline" href={authHref("/forgot-password", redirect)}>
          Forgot password?
        </a>
        <a className="underline" href={authHref("/signup", redirect)}>
          Create account
        </a>
      </div>
    </AuthFrame>
  );
}
