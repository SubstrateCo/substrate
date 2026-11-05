import { AuthFrame } from "./auth-frame";
import { FormMessage } from "./form-message";
import { Button } from "../primitives/button";
import { Input } from "../primitives/input";
import { Label } from "../primitives/label";

export function VerifyEmailScreen({
  email,
  invalid = false,
  pending = false,
  success = false,
  error,
  onSubmit,
  loginHref,
}: {
  email: string;
  invalid?: boolean;
  pending?: boolean;
  success?: boolean;
  error?: Error | null;
  onSubmit: (form: FormData) => void;
  loginHref: string;
}) {
  return (
    <AuthFrame
      title="Verify your email"
      description="Open the link in your email before entering a workspace. Then return to sign in."
    >
      {invalid && (
        <FormMessage message="This verification link is invalid or expired. Request a new link below." />
      )}
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(new FormData(event.currentTarget));
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
          error={error}
          reserve
          message={
            success ? "Verification email requested. Check your inbox and spam folder." : undefined
          }
        />
        <Button className="w-full" disabled={pending}>
          {pending ? "Sending…" : "Resend verification email"}
        </Button>
      </form>
      <a className="block text-sm underline" href={loginHref}>
        Back to sign in
      </a>
    </AuthFrame>
  );
}
