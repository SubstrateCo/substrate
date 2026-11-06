import { PendingButton } from "../feedback/pending-button";
import { Input } from "../primitives/input";
import { Label } from "../primitives/label";
import { AuthFrame } from "./auth-frame";
import { FormMessage } from "./form-message";

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
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (pending) return;
          onSubmit(new FormData(event.currentTarget));
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" autoComplete="name" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>
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
