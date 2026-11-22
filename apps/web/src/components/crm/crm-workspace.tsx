import { Link } from "@tanstack/react-router";

import { AccountDetail } from "./account-detail";
import { CrmSettings } from "./crm-settings";
import type { CrmSection } from "./crm-types";
import { DealDetail } from "./deal-detail";
import { RecordCollection } from "@/components/records/record-collection";
import { Button } from "@/components/ui/button";
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
  let content;
  if (section === "settings") content = <CrmSettings organizationId={organizationId} />;
  else if (!recordId)
    content = <RecordCollection key={section} organizationId={organizationId} kind={section} />;
  else {
    const Detail = { accounts: AccountDetail, deals: DealDetail }[section];
    content = <Detail key={recordId} organizationId={organizationId} entityId={recordId} />;
  }
  return (
    <div className="@container flex min-h-0 flex-1 flex-col">
      <nav
        aria-label="CRM"
        className="flex shrink-0 items-center gap-1 overflow-x-auto border-b px-4 py-2"
      >
        {sections.map(({ value, label, icon: Icon }) => (
          <Button key={value} variant={section === value ? "secondary" : "ghost"} size="sm" asChild>
            <Link
              to="/crm"
              search={{ workspaceId: organizationId, section: value }}
              aria-current={section === value ? "page" : undefined}
            >
              <Icon aria-hidden />
              {label}
            </Link>
          </Button>
        ))}
      </nav>
      {content}
    </div>
  );
}
