import { AuthFrame } from "./auth-frame";
import { FormMessage } from "./form-message";
import { PendingButton } from "../feedback/pending-button";
import { ContentNotice } from "../feedback/content-notice";
import { Input } from "../primitives/input";
import { Label } from "../primitives/label";

export function ResetPasswordForm({
  invalid = false,
  pending = false,
  success = false,
  error,
  onSubmit,
  loginHref,
  requestResetHref,
}: {
  invalid?: boolean;
  pending?: boolean;
  success?: boolean;
  error?: Error | null;
  onSubmit: (form: FormData) => void;
  loginHref: string;
  requestResetHref: string;
}) {
  return (
    <AuthFrame title="Choose a new password" description="Use at least 8 characters.">
      {invalid && (
        <ContentNotice
          title="Reset link unavailable"
          description="This reset link is missing, invalid, or expired. Request a new link."
        />
      )}
      {!invalid && success && (
        <>
          <FormMessage message="Your password was changed. You can now sign in." />
          <a className="block underline" href={loginHref}>
            Sign in
          </a>
        </>
      )}
      {!invalid && !success && (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (pending) return;
            onSubmit(new FormData(event.currentTarget));
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
          <PendingButton className="w-full" pending={pending} pendingLabel="Saving…">
            Save new password
          </PendingButton>
          <FormMessage
            error={error}
            errorDescription="We couldn’t reset your password. Try again, or request a new reset link."
          />
        </form>
      )}
      <a className="block text-sm underline" href={requestResetHref}>
        Request a new reset link
      </a>
    </AuthFrame>
  );
}
