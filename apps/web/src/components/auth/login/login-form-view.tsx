import { PendingButton } from "../../feedback/pending-button";
import { EmailField, NativeField, NativeForm } from "../../forms/native-form";
import { AuthLink } from "../auth-link";
import { FormMessage } from "@/components/feedback/form-message";
import type { authLink } from "@/lib/auth/navigation";

export function LoginForm({
  submitVariant = "default",
  email = "",
  pending = false,
  error,
  onSubmit,
  forgotPasswordLink,
}: {
  submitVariant?: "default" | "outline";
  email?: string;
  pending?: boolean;
  error?: Error | null;
  onSubmit: (form: FormData) => void;
  forgotPasswordLink: ReturnType<typeof authLink>;
}) {
  return (
    <NativeForm pending={pending} onSubmit={onSubmit}>
      <EmailField defaultValue={email} autoFocus={!email} />
      <NativeField
        id="password"
        name="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        // A returning email is already filled in, so the password is the next thing to type.
        autoFocus={!!email}
        labelAction={
          <AuthLink
            {...forgotPasswordLink}
            className="text-xs font-normal text-muted-foreground hover:text-foreground"
          >
            Forgot password?
          </AuthLink>
        }
        required
        missingMessage="Enter your password."
      />
      <FormMessage
        error={error}
        errorDescription="We couldn’t sign you in. Check your details and try again."
      />
      <PendingButton className="w-full" size="lg" variant={submitVariant} pending={pending}>
        Sign in
      </PendingButton>
    </NativeForm>
  );
}
