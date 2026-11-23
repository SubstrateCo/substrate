import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { useState } from "react";

import { MessageRecordEditor } from "./message-record-editor";
import { CrmResourceState } from "@/components/crm/crm-resource-state";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { ContentNotice } from "@/components/feedback/content-notice";
import { useOrganizationApps } from "@/components/workspace/organization-apps";
import { personLink, recordLink } from "@/lib/navigation/record-links";
import { useCreateCrmFromMessage } from "@/queries/context/crm-from-message";
import { crmSettingsOptions, pipelineOptions } from "@/queries/crm/options";
import { Handshake } from "lucide-react";
import { toast } from "sonner";

export function MessageRecordCreator({
  organizationId,
  messageId,
  kind,
  onClose,
  onCreated,
}: {
  organizationId: string;
  messageId: string;
  kind: "account" | "contact" | "deal";
  onClose: () => void;
  onCreated: () => void;
}) {
  const [requestId] = useState(() => crypto.randomUUID());
  const navigate = useNavigate();
  const apps = useOrganizationApps();
  const create = useCreateCrmFromMessage(organizationId);
  const pipeline = useQuery({ ...pipelineOptions(organizationId), enabled: kind === "deal" });
  const settings = useQuery({ ...crmSettingsOptions(organizationId), enabled: kind === "deal" });
  const stages = (pipeline.data ?? [])
    .filter((stage) => !stage.retired)
    .map((stage) => ({ value: stage.id, label: stage.name }));
  const loading = pipeline.isPending || settings.isPending;
  const error = pipeline.error ?? settings.error;
  if (kind === "deal" && (loading || error || !stages.length))
    return (
      <ConfirmDialog
        title="Create deal from this message"
        description="Choose an active CRM stage and use the workspace currency default."
        onClose={onClose}
      >
        <CrmResourceState
          compact
          pending={loading}
          error={error}
          onRetry={() => {
            void pipeline.refetch();
            void settings.refetch();
          }}
        />
        {!loading && !error && !stages.length && (
          <ContentNotice
            icon={Handshake}
            title="No active stages"
            description="Add an active stage in CRM settings before creating a deal."
          />
        )}
      </ConfirmDialog>
    );
  const section = { account: "accounts", contact: "contacts", deal: "deals" } as const;
  return (
    <MessageRecordEditor
      organizationId={organizationId}
      kind={section[kind]}
      stages={stages}
      defaultCurrency={settings.data?.defaultCurrency}
      pending={create.isPending}
      error={create.error}
      onClose={onClose}
      onConfirm={(draft) =>
        create.mutate(
          { messageId, requestId, draft },
          {
            onSuccess: (result) => {
              const target =
                result.entityType === "contact"
                  ? personLink(organizationId, result.entityId, apps.enabled("crm"))
                  : recordLink(organizationId, section[result.entityType], result.entityId);
              toast.success(`Created ${kind} with message provenance.`, {
                action: { label: `Open ${kind}`, onClick: () => void navigate(target) },
              });
              onCreated();
            },
          },
        )
      }
    />
  );
}
