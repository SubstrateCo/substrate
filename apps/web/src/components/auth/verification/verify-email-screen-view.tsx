import { PendingButton } from "../../feedback/pending-button";
import { EmailField, NativeForm } from "../../forms/native-form";
import { AuthFrame } from "../auth-frame";
import { AuthLink } from "../auth-link";
import { FormMessage } from "@/components/feedback/form-message";
import { Button } from "@/components/ui/button";
import type { authLink } from "@/lib/auth/navigation";

const verifyCopy = {
  title: "Verify your email",
  description:
    "Open the link we emailed you to finish setting up your account. Need a new one? Resend it below.",
  action: "Resend verification email",
};

const invalidLinkCopy = {
  title: "This verification link doesn’t work",
  description:
    "It may have expired or already been used. Send a new one and open it from your inbox.",
  action: "Send a new link",
};

export function VerifyEmailScreen({
  email,
  invalid = false,
  pending = false,
  sentTo,
  error,
  onSubmit,
  onReset,
  loginLink,
}: {
  email: string;
  invalid?: boolean;
  pending?: boolean;
  /** The address a new link was just sent to. */
  sentTo?: string;
  error?: Error | null;
  onSubmit: (form: FormData) => void;
  onReset: () => void;
  loginLink: ReturnType<typeof authLink>;
}) {
  const footer = <AuthLink {...loginLink}>Back to sign in</AuthLink>;
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
        <Button type="button" variant="outline" size="lg" className="w-full" onClick={onReset}>
          Use a different email
        </Button>
      </AuthFrame>
    );
  const copy = invalid ? invalidLinkCopy : verifyCopy;
  return (
    <AuthFrame title={copy.title} description={copy.description} footer={footer}>
      <NativeForm pending={pending} onSubmit={onSubmit}>
        <EmailField defaultValue={email} />
        <FormMessage
          error={error}
          errorDescription="We couldn’t send a verification email. Please try again."
        />
        <PendingButton className="w-full" size="lg" pending={pending}>
          {copy.action}
        </PendingButton>
      </NativeForm>
    </AuthFrame>
  );
}
