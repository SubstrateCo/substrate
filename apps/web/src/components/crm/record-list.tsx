import { Link } from "@tanstack/react-router";

import { dealAmount, outcomeLabel, singularLabels, type CrmKind } from "./crm-types";
import { ContentNotice } from "@/components/feedback/content-notice";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { recordLink } from "@/lib/navigation/record-links";
import { Building2, Handshake, Users } from "lucide-react";

export type CrmListRow = {
  entityId: string;
  name: string;
  description?: string | null;
  amount?: string | null;
  currency?: string | null;
  outcome?: string;
  stageName?: string;
};

export function RecordList({
  kind,
  organizationId,
  rows,
}: {
  kind: CrmKind;
  organizationId: string;
  rows: CrmListRow[];
}) {
  if (!rows.length)
    return (
      <ContentNotice
        icon={{ accounts: Building2, contacts: Users, deals: Handshake }[kind]}
        title={`No ${kind} found`}
        description={`Create a ${singularLabels[kind]}, or adjust your search.`}
      />
    );
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table aria-label={kind}>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>
              {{ deals: "Stage / outcome", accounts: "Domain", contacts: "Notes" }[kind]}
            </TableHead>
            {kind === "deals" && <TableHead>Amount</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.entityId}>
              <TableCell>
                <Link
                  {...recordLink(organizationId, kind, row.entityId)}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {row.name}
                </Link>
              </TableCell>
              <TableCell>
                <span className="block max-w-80 truncate text-muted-foreground">
                  {kind === "deals" ? dealStatus(row) : row.description || "—"}
                </span>
              </TableCell>
              {kind === "deals" && (
                <TableCell>
                  <span className="tabular-nums">
                    {dealAmount(row.amount ?? null, row.currency ?? null)}
                  </span>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function dealStatus(row: CrmListRow) {
  if (row.outcome === "open") return row.stageName ?? "Open";
  return outcomeLabel(row.outcome ?? "open");
}
