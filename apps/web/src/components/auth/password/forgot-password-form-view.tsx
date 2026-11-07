import { PendingButton } from "../../feedback/pending-button";
import { useNativeValidation } from "../../forms/use-native-validation";
import { Field, FieldError, FieldLabel } from "../../ui/field";
import { Input } from "../../ui/input";
import { AuthFrame } from "../auth-frame";
import { FormMessage } from "../form-message";

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
  const validation = useNativeValidation();
  return (
    <AuthFrame
      title="Reset your password"
      description="We will send a reset link if an account exists for this email."
    >
      <form
        className="space-y-4"
        onInvalidCapture={validation.onInvalid}
        onInputCapture={validation.onInput}
        onSubmit={(event) => {
          event.preventDefault();
          if (pending) return;
          onSubmit(new FormData(event.currentTarget));
        }}
      >
        <Field data-invalid={Boolean(validation.errors.email)}>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            {...validation.inputProps("email")}
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
          <FieldError id="email-error">{validation.errors.email}</FieldError>
        </Field>
        <PendingButton className="w-full" pending={pending} pendingLabel="Sending…">
          Send reset link
        </PendingButton>
        <FormMessage
          error={error}
          errorDescription="We couldn’t send a reset link. Please try again."
          message={success ? "Check your inbox for a password reset link." : undefined}
        />
      </form>
      <a className="block text-sm underline" href={loginHref}>
        Back to sign in
      </a>
    </AuthFrame>
  );
}
