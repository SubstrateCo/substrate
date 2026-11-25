import { useState } from "react";

import { PendingButton } from "../../feedback/pending-button";
import { NativeField, NativeForm } from "../../forms/native-form";
import { workspaceSlug } from "./workspace-slug";
import { FormMessage } from "@/components/feedback/form-message";
import { Button } from "@/components/ui/button";

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
  const [editingSlug, setEditingSlug] = useState(false);
  const slug = customSlug ?? workspaceSlug(name);
  const showSlugField = editingSlug || (name.trim().length > 0 && !slug);
  return (
    <NativeForm pending={pending} onSubmit={onSubmit}>
      <NativeField
        id="organization-name"
        name="name"
        label="Workspace name"
        placeholder="For example: Northwind Labs"
        autoComplete="organization"
        missingMessage="Enter a workspace name."
        value={name}
        onChange={(event) => setName(event.currentTarget.value)}
        required
      />
      {showSlugField ? (
        <NativeField
          id="organization-slug"
          name="slug"
          label="Workspace slug"
          description="Filled in from the name. Use lowercase letters, numbers, and hyphens."
          placeholder="For example: northwind-labs"
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          title="Use lowercase letters, numbers, and single hyphens between words."
          missingMessage="Enter a workspace slug."
          autoCapitalize="none"
          spellCheck={false}
          value={slug}
          onChange={(event) => setCustomSlug(event.currentTarget.value)}
          required
        />
      ) : (
        <>
          {/* The derived slug shows once there is one; an empty name has nothing to show. */}
          {slug && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="min-w-0 wrap-anywhere">Workspace slug: {slug}</span>
              <Button type="button" variant="link" size="sm" onClick={() => setEditingSlug(true)}>
                Edit
              </Button>
            </div>
          )}
          <input type="hidden" name="slug" value={slug} />
        </>
      )}
      <FormMessage
        error={error}
        errorDescription="We couldn’t create your workspace. Check the name and slug, then try again."
      />
      <PendingButton className="w-full" size="lg" pending={pending}>
        Create workspace
      </PendingButton>
    </NativeForm>
  );
}
