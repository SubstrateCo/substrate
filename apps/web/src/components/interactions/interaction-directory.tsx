import type {
  InteractionDirectory as DirectoryInput,
  InteractionTimeline,
} from "@substrate/contracts/context/interactions";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { useState } from "react";

import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { SegmentedControl } from "@/components/forms/segmented-control";
import { Timestamp } from "@/components/time/timestamp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useSearchDebounce } from "@/hooks/use-search-debounce";
import { interactionDirectoryOptions } from "@/queries/context/interactions";
import { Building2, Users } from "lucide-react";

export function InteractionDirectory({
  period,
  type,
}: {
  period: InteractionTimeline;
  type: "people" | "accounts";
}) {
  const [search, setSearch] = useState("");
  const [frequency, setFrequency] = useState("all");
  const [sort, setSort] = useState("latest");
  const [pageSize, setPageSize] = useState("25");
  const debounced = useSearchDebounce(search, `${frequency}:${sort}`);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex shrink-0 flex-wrap gap-3">
        <div className="min-w-40 flex-1">
          <Input
            type="search"
            aria-label={type === "people" ? "Search people" : "Search organizations"}
            placeholder={type === "people" ? "Search people…" : "Search organizations…"}
            value={search}
            maxLength={200}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <SegmentedControl
          aria-label="Interaction frequency"
          value={frequency}
          onValueChange={setFrequency}
          options={[
            { value: "all", label: "All" },
            { value: "repeat", label: "2+ interactions" },
          ]}
        />
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger aria-label="Sort by">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="latest">Latest activity</SelectItem>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="count">Most interactions</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <DirectoryPage
        key={`${debounced.query}:${frequency}:${sort}:${pageSize}`}
        input={{
          ...period,
          type,
          pageSize: Number(pageSize),
          search: debounced.query,
          repeat: frequency === "repeat" ? "true" : undefined,
          sort: (["latest", "name", "count"] as const).find((value) => value === sort),
        }}
        pending={debounced.pending}
        onPageSizeChange={setPageSize}
      />
    </div>
  );
}

function DirectoryPage({
  input,
  pending,
  onPageSizeChange,
}: {
  input: DirectoryInput;
  pending: boolean;
  onPageSizeChange: (value: string) => void;
}) {
  const [offset, setOffset] = useState(0);
  const query = useQuery({
    ...interactionDirectoryOptions({ ...input, offset }),
    enabled: !pending,
  });
  const pageSize = input.pageSize ?? 25;
  if (query.error)
    return <ErrorState title="Couldn’t load the directory" onRetry={() => void query.refetch()} />;
  if (!query.data) return <LoadingState label="Loading interaction directory…" rows={5} />;
  if (!query.data.items.length)
    return (
      <ContentNotice
        title={input.type === "people" ? "No matching people" : "No matching organizations"}
        description="Try another search or period. Only records with readable logged interactions appear here."
        icon={input.type === "people" ? Users : Building2}
      />
    );
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border">
        <Table aria-label={input.type === "people" ? "People directory" : "Organization directory"}>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Interactions</TableHead>
              {input.type === "accounts" && <TableHead>Active contacts</TableHead>}
              <TableHead>Last interaction</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.data.items.map((row) => (
              <TableRow key={row.entityId}>
                <TableCell>
                  <Link
                    to="/interactions"
                    search={(previous) => ({
                      ...previous,
                      section: input.type === "people" ? "person" : "account",
                      profileId: row.entityId,
                      tab: undefined,
                    })}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {row.name}
                  </Link>
                </TableCell>
                <TableCell>{row.count}</TableCell>
                {input.type === "accounts" && <TableCell>{row.contacts}</TableCell>}
                <TableCell>
                  <Timestamp value={row.last} format="datetime" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Rows per page</span>
          <Select value={String(pageSize)} onValueChange={onPageSizeChange}>
            <SelectTrigger aria-label="Rows per page" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["25", "50", "100"].map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Page {Math.floor(offset / pageSize) + 1}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - pageSize))}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!query.data.more}
            onClick={() => setOffset(offset + pageSize)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
