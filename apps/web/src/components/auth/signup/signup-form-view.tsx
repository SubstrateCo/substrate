import { PendingButton } from "../../feedback/pending-button";
import { EmailField, NativeField, NativeForm } from "../../forms/native-form";
import { FormMessage } from "@/components/feedback/form-message";

export function SignupForm({
  pending = false,
  error,
  onSubmit,
}: {
  pending?: boolean;
  error?: Error | null;
  onSubmit: (form: FormData) => void;
}) {
  return (
    <NativeForm pending={pending} onSubmit={onSubmit}>
      <NativeField
        id="name"
        name="name"
        label="Name"
        autoComplete="name"
        autoFocus
        missingMessage="Enter your name."
        required
      />
      <EmailField />
      <NativeField
        id="password"
        name="password"
        label="Password"
        description="Use at least 8 characters."
        type="password"
        autoComplete="new-password"
        minLength={8}
        missingMessage="Choose a password."
        required
      />
      <FormMessage
        error={error}
        errorDescription="We couldn’t create your account. Please try again."
      />
      <PendingButton className="w-full" size="lg" pending={pending}>
        Create account
      </PendingButton>
    </NativeForm>
  );
}
