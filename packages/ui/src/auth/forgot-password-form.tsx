import { AuthFrame } from "./auth-frame";
import { FormMessage } from "./form-message";
import { Button } from "../primitives/button";
import { Input } from "../primitives/input";
import { Label } from "../primitives/label";

export function ForgotPasswordForm({
  pending = false,
  success = false,
  error,
  onSubmit,
  loginHref,
}: {
  pending?: boolean;
  success?: boolean;
  error?: Error | null;
  onSubmit: (form: FormData) => void;
  loginHref: string;
}) {
  return (
    <AuthFrame
      title="Reset your password"
      description="We will send a reset link if an account exists for this email."
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(new FormData(event.currentTarget));
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <FormMessage
          error={error}
          message={success ? "Check your inbox for a password reset link." : undefined}
        />
        <Button className="w-full" disabled={pending}>
          {pending ? "Sending…" : "Send reset link"}
        </Button>
      </form>
      <a className="block text-sm underline" href={loginHref}>
        Back to sign in
      </a>
    </AuthFrame>
  );
}
