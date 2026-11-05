import { useMutation } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { authHref } from "@/lib/auth-navigation";
import { AuthFrame } from "./auth-frame";
import { FormMessage } from "./form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    <AuthFrame
      title="Reset your password"
      description="We will send a reset link if an account exists for this email."
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          reset.mutate(new FormData(event.currentTarget));
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <FormMessage
          error={reset.error}
          message={reset.isSuccess ? "Check your inbox for a password reset link." : undefined}
        />
        <Button className="w-full" disabled={reset.isPending}>
          {reset.isPending ? "Sending…" : "Send reset link"}
        </Button>
      </form>
      <a className="block text-sm underline" href={authHref("/login", redirect)}>
        Back to sign in
      </a>
    </AuthFrame>
  );
}
