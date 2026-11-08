import { useMutation } from "@tanstack/react-query";

import { formText } from "@/components/auth/form-values";
import { CreateOrganizationForm as CreateOrganizationFormView } from "@/components/organizations/selection/create-organization-form-view";
import { authClient } from "@/lib/auth/client";
import { activateOrganization } from "@/lib/auth/organization";
import { unwrap } from "@/lib/auth/result";

export function CreateOrganizationForm() {
  const create = useMutation({
    mutationFn: async (form: FormData) => {
      const organization = unwrap(
        await authClient.organization.create({
          name: formText(form, "name").trim(),
          slug: formText(form, "slug").trim(),
        }),
      );
      await activateOrganization(organization.id);
    },
  });
  return (
    <CreateOrganizationFormView
      pending={create.isPending}
      error={create.error}
      onSubmit={(form) => create.mutate(form)}
    />
  );
}
