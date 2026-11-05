import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { authHref } from "@/lib/auth-navigation";
import { AuthFrame } from "./auth-frame";
import { FormMessage } from "./form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const invalid = !token || Boolean(error);
  return (
    <AuthFrame title="Choose a new password" description="Use at least 8 characters.">
      {invalid ? (
        <FormMessage message="This reset link is missing, invalid, or expired. Request a new link." />
      ) : reset.isSuccess ? (
        <>
          <FormMessage message="Your password was changed. You can now sign in." />
          <a className="block underline" href={authHref("/login", redirect)}>
            Sign in
          </a>
        </>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            reset.mutate(new FormData(event.currentTarget));
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input
              id="confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          <FormMessage error={reset.error} />
          <Button className="w-full" disabled={reset.isPending}>
            {reset.isPending ? "Saving…" : "Save new password"}
          </Button>
        </form>
      )}
      <a className="block text-sm underline" href={authHref("/forgot-password", redirect)}>
        Request a new reset link
      </a>
    </AuthFrame>
  );
}
