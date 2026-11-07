import { PendingButton } from "../../feedback/pending-button";
import { useNativeValidation } from "../../forms/use-native-validation";
import { Field, FieldError, FieldLabel } from "../../ui/field";
import { Input } from "../../ui/input";
import { AuthFrame } from "../auth-frame";
import { FormMessage } from "../form-message";

export function LoginForm({
  email = "",
  pending = false,
  error,
  onSubmit,
  forgotPasswordHref,
  signupHref,
}: {
  email?: string;
  pending?: boolean;
  error?: Error | null;
  onSubmit: (form: FormData) => void;
  forgotPasswordHref: string;
  signupHref: string;
}) {
  const validation = useNativeValidation();
  return (
    <AuthFrame title="Welcome back" description="Sign in to your workspace.">
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
            defaultValue={email}
            required
          />
          <FieldError id="email-error">{validation.errors.email}</FieldError>
        </Field>
        <Field data-invalid={Boolean(validation.errors.password)}>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input
            {...validation.inputProps("password")}
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
          <FieldError id="password-error">{validation.errors.password}</FieldError>
        </Field>
        <PendingButton className="w-full" pending={pending} pendingLabel="Signing in…">
          Sign in
        </PendingButton>
        <FormMessage
          error={error}
          errorDescription="We couldn’t sign you in. Check your details and try again."
        />
      </form>
      <div className="flex justify-between gap-4 text-sm">
        <a className="underline" href={forgotPasswordHref}>
          Forgot password?
        </a>
        <a className="underline" href={signupHref}>
          Create account
        </a>
      </div>
    </AuthFrame>
  );
}
