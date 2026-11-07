import { PendingButton } from "../../feedback/pending-button";
import { useNativeValidation } from "../../forms/use-native-validation";
import { Field, FieldDescription, FieldError, FieldLabel } from "../../ui/field";
import { Input } from "../../ui/input";
import { AuthFrame } from "../auth-frame";
import { FormMessage } from "../form-message";

export function SignupForm({
  pending = false,
  error,
  onSubmit,
  loginHref,
}: {
  pending?: boolean;
  error?: Error | null;
  onSubmit: (form: FormData) => void;
  loginHref: string;
}) {
  const validation = useNativeValidation();
  return (
    <AuthFrame title="Create your account" description="A shared home for your team and its work.">
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
        <Field data-invalid={Boolean(validation.errors.name)}>
          <FieldLabel htmlFor="name">Name</FieldLabel>
          <Input
            {...validation.inputProps("name")}
            id="name"
            name="name"
            autoComplete="name"
            required
          />
          <FieldError id="name-error">{validation.errors.name}</FieldError>
        </Field>
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
        <Field data-invalid={Boolean(validation.errors.password)}>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input
            {...validation.inputProps("password")}
            aria-describedby={
              validation.errors.password
                ? "password-description password-error"
                : "password-description"
            }
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
          <FieldDescription id="password-description">Use at least 8 characters.</FieldDescription>
          <FieldError id="password-error">{validation.errors.password}</FieldError>
        </Field>
        <PendingButton className="w-full" pending={pending} pendingLabel="Creating account…">
          Create account
        </PendingButton>
        <FormMessage
          error={error}
          errorDescription="We couldn’t create your account. Please try again."
        />
      </form>
      <p className="text-sm">
        Already have an account?{" "}
        <a className="underline" href={loginHref}>
          Sign in
        </a>
      </p>
    </AuthFrame>
  );
}
