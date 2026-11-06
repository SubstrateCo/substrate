import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CreateOrganizationForm as CreateOrganizationFormView } from "@/ui/organizations/create-organization-form";
import { authClient } from "@/lib/auth-client";
import { unwrap } from "@/queries/organizations/options";
import { formText } from "@/components/auth/form-values";

export function CreateOrganizationForm() {
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: async (form: FormData) => {
      const organization = unwrap(
        await authClient.organization.create({
          name: formText(form, "name").trim(),
          slug: formText(form, "slug").trim(),
        }),
      );
      unwrap(await authClient.organization.setActive({ organizationId: organization.id }));
      await queryClient.cancelQueries();
      queryClient.clear();
      window.location.assign("/dashboard");
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
