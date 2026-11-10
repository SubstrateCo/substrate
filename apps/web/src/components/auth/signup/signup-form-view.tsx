import { PendingButton } from "../../feedback/pending-button";
import { EmailField, NativeField, NativeForm } from "../../forms/native-form";
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
  return (
    <AuthFrame title="Create your account" description="A shared home for your team and its work.">
      <NativeForm pending={pending} onSubmit={onSubmit}>
        <NativeField id="name" name="name" label="Name" autoComplete="name" required />
        <EmailField />
        <NativeField
          id="password"
          name="password"
          label="Password"
          description="Use at least 8 characters."
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <PendingButton className="w-full" pending={pending} pendingLabel="Creating account…">
          Create account
        </PendingButton>
        <FormMessage
          error={error}
          errorDescription="We couldn’t create your account. Please try again."
        />
      </NativeForm>
      <p className="text-sm">
        Already have an account?{" "}
        <a className="underline" href={loginHref}>
          Sign in
        </a>
      </p>
    </AuthFrame>
  );
}
