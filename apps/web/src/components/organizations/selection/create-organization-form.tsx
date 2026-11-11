import { useMutation } from "@tanstack/react-query";

import { formText } from "@/components/auth/form-values";
import { FormMessage } from "@/components/feedback/form-message";
import { PendingButton } from "@/components/feedback/pending-button";
import { CreateOrganizationForm as CreateOrganizationFormView } from "@/components/organizations/selection/create-organization-form-view";
import { authClient } from "@/lib/auth/client";
import { activateOrganization } from "@/lib/auth/organization";
import { unwrap } from "@/lib/auth/result";

export function CreateOrganizationForm({ destination = "/dashboard" }: { destination?: string }) {
  const activate = useMutation({
    mutationFn: (organizationId: string) => activateOrganization(organizationId, destination),
  });
  const create = useMutation({
    mutationFn: async (form: FormData) => {
      return unwrap(
        await authClient.organization.create({
          name: formText(form, "name").trim(),
          slug: formText(form, "slug").trim(),
        }),
      );
    },
    onSuccess: (organization) => activate.mutate(organization.id),
  });
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
          pending={activate.isPending}
          pendingLabel="Opening…"
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
      onSubmit={(form) => create.mutate(form)}
    />
  );
}
