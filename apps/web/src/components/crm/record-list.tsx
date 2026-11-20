import { Link } from "@tanstack/react-router";

import { dealAmount, outcomeLabel, singularLabels, type CrmKind } from "./crm-types";
import { ContentNotice } from "@/components/feedback/content-notice";
import { SkeletonText } from "@/components/feedback/skeleton-text";
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
  loading = false,
}: {
  kind: CrmKind;
  organizationId: string;
  rows: CrmListRow[];
  loading?: boolean;
}) {
  if (!rows.length && !loading)
    return (
      <ContentNotice
        icon={{ accounts: Building2, contacts: Users, deals: Handshake }[kind]}
        title={`No ${kind} found`}
        description={`Create a ${singularLabels[kind]}, or adjust your search.`}
      />
    );
  return (
    <div
      className="overflow-hidden rounded-lg border"
      role={loading ? "status" : undefined}
      aria-label={loading ? `Loading ${kind}` : undefined}
    >
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
          {loading &&
            [0, 1, 2].map((key) => (
              <RecordListCells
                key={key}
                kind={kind}
                hidden
                name={<SkeletonText width="9rem" />}
                detail={<SkeletonText width="12rem" />}
                amount={<SkeletonText width="5rem" />}
              />
            ))}
          {rows.map((row) => (
            <RecordListCells
              key={row.entityId}
              kind={kind}
              name={
                <Link
                  {...recordLink(organizationId, kind, row.entityId)}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {row.name}
                </Link>
              }
              detail={
                <span className="block max-w-80 truncate text-muted-foreground">
                  {kind === "deals" ? dealStatus(row) : row.description || "—"}
                </span>
              }
              amount={
                <span className="tabular-nums">
                  {dealAmount(row.amount ?? null, row.currency ?? null)}
                </span>
              }
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function RecordListCells({
  kind,
  name,
  detail,
  amount,
  hidden,
}: {
  kind: CrmKind;
  name: React.ReactNode;
  detail: React.ReactNode;
  amount?: React.ReactNode;
  hidden?: boolean;
}) {
  return (
    <TableRow aria-hidden={hidden}>
      <TableCell>{name}</TableCell>
      <TableCell>{detail}</TableCell>
      {kind === "deals" && <TableCell>{amount}</TableCell>}
    </TableRow>
  );
}

function dealStatus(row: CrmListRow) {
  if (row.outcome === "open") return row.stageName ?? "Open";
  return outcomeLabel(row.outcome ?? "open");
}
