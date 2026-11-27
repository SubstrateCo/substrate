import { useNavigate } from "@tanstack/react-router";

import { AccountDetail } from "./account-detail";
import { CrmRecordSheet } from "./crm-record-sheet";
import type { CrmSection } from "./crm-types";
import { CrmSettings } from "./settings/crm-settings";
import {
  PageContent,
  PageLayout,
  PageSidebar,
  PageSidebarContent,
  PageSidebarHeader,
  SidebarNav,
} from "@/components/layout/page-layout";
import { RecordCollection } from "@/components/records/record-collection";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { crmLink } from "@/lib/navigation/record-links";
import { Building2, Handshake, Settings } from "lucide-react";

const sections = [
  { value: "deals", label: "Deals", icon: Handshake },
  { value: "accounts", label: "Accounts", icon: Building2 },
  { value: "settings", label: "Settings", icon: Settings },
] as const;

export function CrmWorkspace({ section, recordId }: { section: CrmSection; recordId?: string }) {
  const { organizationId } = useWorkspaceScope();
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
        <CrmContent section={section} recordId={recordId} />
      </PageContent>
      <CrmRecordSheet
        record={section === "deals" && recordId ? { kind: "deal", entityId: recordId } : null}
        onClose={() => void navigate(crmLink(organizationId, "deals"))}
      />
    </PageLayout>
  );
}

/** The open section. A deal opens in a sheet over its list; an account replaces the list. */
function CrmContent({ section, recordId }: { section: CrmSection; recordId?: string }) {
  if (section === "settings") return <CrmSettings />;
  if (section === "deals" || !recordId) return <RecordCollection key={section} kind={section} />;
  return <AccountDetail key={recordId} entityId={recordId} />;
}
