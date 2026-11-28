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
import { usePanelReturn } from "@/components/layout/use-panel-return";
import { RecordCollection } from "@/components/records/record-collection";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { Building2, Handshake, Settings } from "lucide-react";

const sections = [
  { value: "deals", label: "Deals", icon: Handshake },
  { value: "accounts", label: "Accounts", icon: Building2 },
  { value: "settings", label: "Settings", icon: Settings },
] as const;

export function CrmWorkspace({
  section: requestedSection,
  recordId,
}: {
  section?: CrmSection;
  recordId?: string;
}) {
  const { organizationId } = useWorkspaceScope();
  const section = requestedSection ?? "deals";
  const navigate = useNavigate({ from: "/crm/" });
  const dismiss = usePanelReturn();
  useEffect(() => {
    if (!requestedSection)
      void navigate({
        to: "/crm",
        search: (previous) => ({ ...previous, section }),
        replace: true,
        resetScroll: false,
      });
  }, [navigate, requestedSection, section]);
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
        onClose={() => dismiss({ recordId: undefined })}
      />
    </PageLayout>
  );
}

function CrmContent({ section, recordId }: { section: CrmSection; recordId?: string }) {
  if (section === "settings") return <CrmSettings />;
  if (section === "deals" || !recordId) return <RecordCollection key={section} kind={section} />;
  return <AccountDetail key={recordId} entityId={recordId} />;
}
import { useNavigate } from "@tanstack/react-router";

import { useEffect } from "react";
