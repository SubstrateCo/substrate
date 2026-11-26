import { useNavigate } from "@tanstack/react-router";

import { AccountDetail } from "./account-detail";
import type { CrmSection } from "./crm-types";
import { DealDetail } from "./deals/deal-detail";
import { CrmSettings } from "./settings/crm-settings";
import {
  PageContent,
  PageLayout,
  PageSidebar,
  PageSidebarContent,
  PageSidebarHeader,
  SidebarNav,
} from "@/components/layout/page-layout";
import { PageSheet } from "@/components/layout/page-sheet";
import { RecordCollection } from "@/components/records/record-collection";
import { crmLink } from "@/lib/navigation/record-links";
import { Building2, Handshake, Settings } from "lucide-react";

const sections = [
  { value: "deals", label: "Deals", icon: Handshake },
  { value: "accounts", label: "Accounts", icon: Building2 },
  { value: "settings", label: "Settings", icon: Settings },
] as const;

export function CrmWorkspace({
  organizationId,
  section,
  recordId,
}: {
  organizationId: string;
  section: CrmSection;
  recordId?: string;
}) {
  const navigate = useNavigate();
  return (
    <PageLayout id="crm" aria-label="CRM workspace">
      <PageSidebar aria-label="CRM">
        <PageSidebarHeader title="CRM" />
        <PageSidebarContent>
          <SidebarNav
            label="CRM"
            items={sections.map(({ value, label, icon }) => ({
              key: value,
              label,
              icon,
              link: { to: "/crm", search: { workspaceId: organizationId, section: value } },
              current: section === value,
            }))}
          />
        </PageSidebarContent>
      </PageSidebar>
      <PageContent className="@container">
        <CrmContent organizationId={organizationId} section={section} recordId={recordId} />
      </PageContent>
      <PageSheet
        open={section === "deals" && !!recordId}
        label="Deal"
        onOpenChange={(open) => {
          if (!open) void navigate(crmLink(organizationId, "deals"));
        }}
      >
        {section === "deals" && recordId && (
          <DealDetail key={recordId} organizationId={organizationId} entityId={recordId} />
        )}
      </PageSheet>
    </PageLayout>
  );
}

/** The open section. A deal opens in a sheet over its list; an account replaces the list. */
function CrmContent({
  organizationId,
  section,
  recordId,
}: {
  organizationId: string;
  section: CrmSection;
  recordId?: string;
}) {
  if (section === "settings") return <CrmSettings organizationId={organizationId} />;
  if (section === "deals" || !recordId)
    return <RecordCollection key={section} organizationId={organizationId} kind={section} />;
  return <AccountDetail key={recordId} organizationId={organizationId} entityId={recordId} />;
}
