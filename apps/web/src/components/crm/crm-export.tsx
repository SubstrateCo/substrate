import { organizationSettingsAccess } from "@substrate/contracts/auth/settings-access";
import type { CrmExport as CrmExportInput } from "@substrate/contracts/crm/export";

import { useMutation, useQuery } from "@tanstack/react-query";

import { api } from "@/api/client";
import { NetworkError, readResult } from "@/api/result";
import { FormMessage } from "@/components/feedback/form-message";
import { Button } from "@/components/ui/button";
import { currentOrganizationQueryOptions } from "@/queries/organizations/options";
import { Download } from "lucide-react";

export type CrmExportProps = Pick<
  CrmExportInput,
  "organizationId" | "kind" | "archived" | "search"
>;

function downloadCsv(blob: Blob, filename: string) {
  const link = document.createElement("a");
  link.download = filename;
  const url = URL.createObjectURL(blob);
  try {
    link.href = url;
    document.body.append(link);
    link.click();
  } finally {
    link.remove();
    // Let Chromium begin the download before releasing its in-memory source.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export function CrmExport({ organizationId, kind, archived, search }: CrmExportProps) {
  const organization = useQuery(currentOrganizationQueryOptions(organizationId));
  const allowed =
    !organization.error && organizationSettingsAccess(organization.data?.role).allowed;
  const mutation = useMutation({
    mutationFn: async () => {
      let response;
      try {
        response =
          kind === "contacts"
            ? await api.contacts.export.$get({ query: { organizationId, kind, archived, search } })
            : await api.crm.export.$get({ query: { organizationId, kind, archived, search } });
      } catch (error) {
        if (error instanceof TypeError) throw new NetworkError(error);
        throw error;
      }
      if (response.status !== 200) {
        await readResult(Promise.resolve(response));
        return;
      }
      downloadCsv(await response.blob(), kind === "contacts" ? "contacts.csv" : `crm-${kind}.csv`);
    },
  });

  if (!allowed) return null;

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={mutation.isPending}
        aria-busy={mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        <Download aria-hidden="true" />
        {mutation.isPending ? "Exporting…" : "Export CSV"}
      </Button>
      <FormMessage
        error={mutation.error}
        errorDescription="Couldn’t export CRM records. Try again."
      />
    </div>
  );
}
