import { useMutation } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { authHref } from "@/lib/auth-navigation";
import { AuthFrame } from "./auth-frame";
import { FormMessage } from "./form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formText } from "./form-values";

export function VerifyEmailScreen({
  redirect,
  email,
  error,
}: {
  redirect: string;
  email: string;
  error: string;
}) {
  const resend = useMutation({
    mutationFn: async (form: FormData) => {
      const email = formText(form, "email");
      const result = await authClient.sendVerificationEmail({
        email,
        callbackURL: authHref("/login", redirect, email),
      });
      if (result.error)
        throw new Error(result.error.message || "Could not send verification email.");
    },
  });
  return (
    <AuthFrame
      title="Verify your email"
      description="Open the link in your email before entering a workspace. Then return to sign in."
    >
      {error && (
        <FormMessage message="This verification link is invalid or expired. Request a new link below." />
      )}
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          resend.mutate(new FormData(event.currentTarget));
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={email}
            autoComplete="email"
            required
          />
        </div>
        <FormMessage
          error={resend.error}
          message={
            resend.isSuccess
              ? "Verification email requested. Check your inbox and spam folder."
              : undefined
          }
        />
        <Button className="w-full" disabled={resend.isPending}>
          {resend.isPending ? "Sending…" : "Resend verification email"}
        </Button>
      </form>
      <a className="block text-sm underline" href={authHref("/login", redirect, email)}>
        Back to sign in
      </a>
    </AuthFrame>
  );
}
