import { useState } from "react";

import { FormMessage } from "../../auth/form-message";
import { PendingButton } from "../../feedback/pending-button";
import { NativeField, NativeForm } from "../../forms/native-form";
import { workspaceSlug } from "./workspace-slug";

export function CreateOrganizationForm({
  pending = false,
  error,
  onSubmit,
}: {
  pending?: boolean;
  error?: Error | null;
  onSubmit: (form: FormData) => void;
}) {
  const [name, setName] = useState("");
  // The slug follows the name until the person edits it.
  const [customSlug, setCustomSlug] = useState<string>();
  const slug = customSlug ?? workspaceSlug(name);
  return (
    <NativeForm pending={pending} onSubmit={onSubmit}>
      <NativeField
        id="organization-name"
        name="name"
        label="Workspace name"
        placeholder="Your company"
        autoComplete="organization"
        missingMessage="Enter a workspace name."
        value={name}
        onChange={(event) => setName(event.currentTarget.value)}
        required
      />
      <NativeField
        id="organization-slug"
        name="slug"
        label="Workspace slug"
        description="Filled in from the name. Use lowercase letters, numbers, and hyphens."
        placeholder="your-company"
        pattern="[a-z0-9]+(-[a-z0-9]+)*"
        title="Use lowercase letters, numbers, and single hyphens between words."
        missingMessage="Enter a workspace slug."
        autoCapitalize="none"
        spellCheck={false}
        value={slug}
        onChange={(event) => setCustomSlug(event.currentTarget.value)}
        required
      />
      <FormMessage
        error={error}
        errorDescription="We couldn't create your workspace. Check the name and slug, then try again."
      />
      <PendingButton className="w-full" size="lg" pending={pending} pendingLabel="Creating.">
        Create workspace
      </PendingButton>
    </NativeForm>
  );
}
