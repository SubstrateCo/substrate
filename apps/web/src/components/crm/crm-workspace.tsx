import { Link, useNavigate } from "@tanstack/react-router";

import { AccountDetail } from "./account-detail";
import { CrmSettings } from "./crm-settings";
import type { CrmSection } from "./crm-types";
import { DealDetail } from "./deal-detail";
import {
  PageContent,
  PageLayout,
  PageSidebar,
  PageSidebarContent,
  PageSidebarHeader,
} from "@/components/layout/page-layout";
import { PageSheet } from "@/components/layout/page-sheet";
import { RecordCollection } from "@/components/records/record-collection";
import { Button } from "@/components/ui/button";
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
  let content;
  if (section === "settings") content = <CrmSettings organizationId={organizationId} />;
  else if (section === "deals" || !recordId)
    content = <RecordCollection key={section} organizationId={organizationId} kind={section} />;
  else
    content = <AccountDetail key={recordId} organizationId={organizationId} entityId={recordId} />;
  return (
    <PageLayout id="crm" aria-label="CRM workspace">
      <PageSidebar aria-label="CRM">
        <PageSidebarHeader title="CRM" />
        <PageSidebarContent>
          <nav aria-label="CRM">
            <ul className="flex gap-0.5 overflow-x-auto md:flex-col">
              {sections.map(({ value, label, icon: Icon }) => (
                <li key={value} className="shrink-0">
                  <Button variant="sidebar" className="w-full justify-start" asChild>
                    <Link
                      to="/crm"
                      search={{ workspaceId: organizationId, section: value }}
                      aria-current={section === value ? "page" : undefined}
                    >
                      <Icon aria-hidden className="text-muted-foreground" />
                      {label}
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          </nav>
        </PageSidebarContent>
      </PageSidebar>
      <PageContent className="@container">{content}</PageContent>
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
