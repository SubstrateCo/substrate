import { Link } from "@tanstack/react-router";

import { useMemo } from "react";

import { dealAmount, outcomeLabel, sectionLabels, singularLabels, type CrmKind } from "./crm-types";
import {
  AppTable,
  createAppColumnHelper,
  tableLink,
  type AppTablePagination,
} from "@/components/table";
import { Button } from "@/components/ui/button";
import { recordLink } from "@/lib/navigation/record-links";
import { Building2, Handshake, Plus, Users } from "lucide-react";

export type CrmListRow = {
  entityId: string;
  name: string;
  description?: string | null;
  amount?: string | null;
  currency?: string | null;
  outcome?: string;
  stageName?: string;
};

const column = createAppColumnHelper<CrmListRow>();

function recordColumns(kind: CrmKind, organizationId: string) {
  return column.columns([
    column.accessor("name", {
      header: "Name",
      cell: ({ row }) => (
        <Link
          {...recordLink(organizationId, kind, row.original.entityId)}
          className={tableLink}
          title={row.original.name}
        >
          {row.original.name}
        </Link>
      ),
    }),
    column.accessor((row) => (kind === "deals" ? dealStatus(row) : row.description || "-"), {
      id: "detail",
      header: { deals: "Stage / outcome", accounts: "Domain", contacts: "Notes" }[kind],
      cell: ({ getValue }) => (
        <span className="block max-w-80 truncate text-muted-foreground">{getValue()}</span>
      ),
    }),
    ...(kind === "deals"
      ? [
          column.accessor((row) => dealAmount(row.amount ?? null, row.currency ?? null), {
            id: "amount",
            header: "Amount",
            meta: { align: "end" },
          }),
        ]
      : []),
  ]);
}

export function RecordList({
  kind,
  organizationId,
  rows,
  loading = false,
  fetching = false,
  pagination,
  filtered = false,
  onCreate,
}: {
  kind: CrmKind;
  organizationId: string;
  rows: CrmListRow[];
  loading?: boolean;
  /** A later page is loading. */
  fetching?: boolean;
  pagination?: AppTablePagination;
  /** A search or the archived filter is active, so the empty list says nothing matched. */
  filtered?: boolean;
  /** Offers the empty list's primary action when the viewer can create a record. */
  onCreate?: () => void;
}) {
  const columns = useMemo(() => recordColumns(kind, organizationId), [kind, organizationId]);
  return (
    <AppTable
      name={kind}
      columns={columns}
      data={rows}
      getRowId={(row) => row.entityId}
      loading={loading}
      loadingMessage={`Loading ${kind}`}
      fetching={fetching}
      pagination={pagination}
      empty={{
        icon: { accounts: Building2, contacts: Users, deals: Handshake }[kind],
        title: filtered ? `No ${kind} found` : `No ${kind} yet`,
        description: filtered
          ? "Try a different search or filter."
          : `${sectionLabels[kind]} you create appear here.`,
        action: !filtered && onCreate && (
          <Button onClick={onCreate}>
            <Plus aria-hidden />
            New {singularLabels[kind]}
          </Button>
        ),
      }}
    />
  );
}

function dealStatus(row: CrmListRow) {
  if (row.outcome === "open") return row.stageName ?? "Open";
  return outcomeLabel(row.outcome ?? "open");
}
