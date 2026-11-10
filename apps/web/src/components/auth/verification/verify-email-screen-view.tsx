import { PendingButton } from "../../feedback/pending-button";
import { EmailField, NativeForm } from "../../forms/native-form";
import { Button } from "../../ui/button";
import { AuthFrame } from "../auth-frame";
import { AuthLink } from "../auth-link";
import { FormMessage } from "../form-message";

export function VerifyEmailScreen({
  email,
  invalid = false,
  pending = false,
  sentTo,
  error,
  onSubmit,
  onReset,
  loginHref,
}: {
  email: string;
  invalid?: boolean;
  pending?: boolean;
  /** The address a new link was just sent to. */
  sentTo?: string;
  error?: Error | null;
  onSubmit: (form: FormData) => void;
  onReset: () => void;
  loginHref: string;
}) {
  const footer = <AuthLink href={loginHref}>Back to sign in</AuthLink>;
  if (sentTo)
    return (
      <AuthFrame
        title="Check your inbox"
        description={
          <>
            We sent a new verification link to{" "}
            <span className="font-medium wrap-anywhere text-foreground">{sentTo}</span>. Open it,
            then sign in. Check your spam folder if it doesn’t arrive.
          </>
        }
        footer={footer}
      >
        <Button type="button" variant="outline" className="w-full" onClick={onReset}>
          Use a different email
        </Button>
      </AuthFrame>
    );
  return (
    <AuthFrame
      title={invalid ? "This verification link doesn’t work" : "Verify your email"}
      description={
        invalid
          ? "It may have expired or already been used. Send a new one and open it from your inbox."
          : "Open the link we emailed you to finish setting up your account. Need a new one? Send it again."
      }
      footer={footer}
    >
      <NativeForm pending={pending} onSubmit={onSubmit}>
        <EmailField defaultValue={email} />
        <FormMessage
          error={error}
          errorDescription="We couldn’t send a verification email. Please try again."
        />
        <PendingButton className="w-full" size="lg" pending={pending} pendingLabel="Sending.">
          {invalid ? "Send a new link" : "Resend verification email"}
        </PendingButton>
      </NativeForm>
    </AuthFrame>
  );
}
