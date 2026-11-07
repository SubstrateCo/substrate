import { ContentNotice } from "../feedback/content-notice";
import { PendingButton } from "../feedback/pending-button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { AuthFrame } from "./auth-frame";
import { FormMessage } from "./form-message";

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
        <ContentNotice
          title="Verification link unavailable"
          description="This verification link is invalid or expired. Request a new link below."
        />
      )}
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (pending) return;
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
          errorDescription="We couldn’t send a verification email. Please try again."
          reserve
          message={
            success ? "Verification email requested. Check your inbox and spam folder." : undefined
          }
        />
        <PendingButton className="w-full" pending={pending} pendingLabel="Sending…">
          Resend verification email
        </PendingButton>
      </form>
      <a className="block text-sm underline" href={loginHref}>
        Back to sign in
      </a>
    </AuthFrame>
  );
}
