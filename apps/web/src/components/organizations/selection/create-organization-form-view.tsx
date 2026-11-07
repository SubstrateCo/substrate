import { FormMessage } from "../../auth/form-message";
import { PendingButton } from "../../feedback/pending-button";
import { useNativeValidation } from "../../forms/use-native-validation";
import { Field, FieldDescription, FieldError, FieldLabel } from "../../ui/field";
import { Input } from "../../ui/input";

export function CreateOrganizationForm({
  pending = false,
  error,
  onSubmit,
}: {
  pending?: boolean;
  error?: Error | null;
  onSubmit: (form: FormData) => void;
}) {
  const validation = useNativeValidation();
  return (
    <form
      className="space-y-4"
      onInvalidCapture={validation.onInvalid}
      onInputCapture={validation.onInput}
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) return;
        onSubmit(new FormData(event.currentTarget));
      }}
    >
      <Field data-invalid={Boolean(validation.errors["organization-name"])}>
        <FieldLabel htmlFor="organization-name">Workspace name</FieldLabel>
        <Input
          {...validation.inputProps("organization-name")}
          id="organization-name"
          name="name"
          placeholder="Your company"
          required
        />
        <FieldError id="organization-name-error">
          {validation.errors["organization-name"]}
        </FieldError>
      </Field>
      <Field data-invalid={Boolean(validation.errors["organization-slug"])}>
        <FieldLabel htmlFor="organization-slug">Workspace slug</FieldLabel>
        <Input
          {...validation.inputProps("organization-slug")}
          aria-describedby={
            validation.errors["organization-slug"]
              ? "organization-slug-description organization-slug-error"
              : "organization-slug-description"
          }
          id="organization-slug"
          name="slug"
          placeholder="your-company"
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          title="Use lowercase letters, numbers, and single hyphens between words."
          required
        />
        <FieldDescription id="organization-slug-description">
          Lowercase letters, numbers, and single hyphens between words.
        </FieldDescription>
        <FieldError id="organization-slug-error">
          {validation.errors["organization-slug"]}
        </FieldError>
      </Field>
      <FormMessage
        error={error}
        errorDescription="We couldn’t create your workspace. Check the name and slug, then try again."
      />
      <PendingButton pending={pending} pendingLabel="Creating…">
        Create workspace
      </PendingButton>
    </form>
  );
}
