import { FormMessage } from "../../auth/form-message";
import { PendingButton } from "../../feedback/pending-button";
import { NativeField, NativeForm } from "../../forms/native-form";

export function CreateOrganizationForm({
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
        id="organization-name"
        name="name"
        label="Workspace name"
        placeholder="Your company"
        required
      />
      <NativeField
        id="organization-slug"
        name="slug"
        label="Workspace slug"
        description="Lowercase letters, numbers, and single hyphens between words."
        placeholder="your-company"
        pattern="[a-z0-9]+(-[a-z0-9]+)*"
        title="Use lowercase letters, numbers, and single hyphens between words."
        required
      />
      <FormMessage
        error={error}
        errorDescription="We couldn’t create your workspace. Check the name and slug, then try again."
      />
      <PendingButton pending={pending} pendingLabel="Creating…">
        Create workspace
      </PendingButton>
    </NativeForm>
  );
}
