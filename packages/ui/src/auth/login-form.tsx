import { AuthFrame } from "./auth-frame";
import { FormMessage } from "./form-message";
import { Button } from "../primitives/button";
import { Input } from "../primitives/input";
import { Label } from "../primitives/label";

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
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(new FormData(event.currentTarget));
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={email}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        <FormMessage error={error} />
        <Button className="w-full" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
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
