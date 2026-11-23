import { formText } from "@/components/auth/form-values";
import { FormMessage } from "@/components/feedback/form-message";
import { PendingButton } from "@/components/feedback/pending-button";
import { CreateOrganizationForm as CreateOrganizationFormView } from "@/components/organizations/selection/create-organization-form-view";
import {
  useActivateOrganization,
  useCreateOrganization,
} from "@/queries/organizations/selection-mutations";

export function CreateOrganizationForm({ destination = "/dashboard" }: { destination?: string }) {
  const activate = useActivateOrganization(destination);
  const create = useCreateOrganization();
  const created = create.data;
  if (created) {
    return (
      <div className="space-y-4">
        <p className="text-sm">{created.name} was created. Continue to open it.</p>
        <FormMessage
          error={activate.error}
          errorDescription="Your workspace was created, but we couldn’t open it. Try again without creating another one."
        />
        <PendingButton
          className="w-full"
          size="lg"
          pending={activate.isPending}
          onClick={() => activate.mutate(created.id)}
        >
          Continue setup
        </PendingButton>
      </div>
    );
  }
  return (
    <CreateOrganizationFormView
      pending={create.isPending}
      error={create.error}
      onSubmit={(form) =>
        create.mutate(
          {
            name: formText(form, "name").trim(),
            slug: formText(form, "slug").trim(),
          },
          { onSuccess: (organization) => activate.mutate(organization.id) },
        )
      }
    />
  );
}
