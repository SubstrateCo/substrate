import { PendingButton } from "../../feedback/pending-button";
import { EmailField, NativeField, NativeForm } from "../../forms/native-form";
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
  return (
    <AuthFrame title="Welcome back" description="Sign in to your workspace.">
      <NativeForm pending={pending} onSubmit={onSubmit}>
        <EmailField defaultValue={email} />
        <NativeField
          id="password"
          name="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          required
        />
        <PendingButton className="w-full" pending={pending} pendingLabel="Signing in…">
          Sign in
        </PendingButton>
        <FormMessage
          error={error}
          errorDescription="We couldn’t sign you in. Check your details and try again."
        />
      </NativeForm>
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
