import { PendingButton } from "../../feedback/pending-button";
import { EmailField, NativeField, NativeForm } from "../../forms/native-form";
import { AuthFrame } from "../auth-frame";
import { AuthLink } from "../auth-link";
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
    <AuthFrame
      title="Welcome back"
      description="Sign in to your workspace."
      footer={
        <>
          New to Startup OS? <AuthLink href={signupHref}>Create account</AuthLink>
        </>
      }
    >
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
        <div className="text-right">
          <AuthLink
            href={forgotPasswordHref}
            className="text-sm font-normal text-muted-foreground hover:text-foreground"
          >
            Forgot password?
          </AuthLink>
        </div>
        <FormMessage
          error={error}
          errorDescription="We couldn’t sign you in. Check your details and try again."
        />
        <PendingButton className="w-full" size="lg" pending={pending} pendingLabel="Signing in.">
          Sign in
        </PendingButton>
      </NativeForm>
    </AuthFrame>
  );
}
