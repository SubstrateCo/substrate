import type { ReactNode } from "react";

import { LoadingState } from "@/components/feedback/loading-state";
import { useDelayedLoading } from "@/components/settings/use-delayed-loading";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus } from "lucide-react";

export function CatalogSection({
  title,
  label,
  description,
  addLabel,
  onAdd,
  children,
  empty,
  emptyState,
  loading = false,
  disabled,
  controls,
}: {
  title: string;
  label: string;
  description?: string;
  addLabel: string;
  onAdd: () => void;
  children: ReactNode;
  empty: boolean;
  emptyState?: ReactNode;
  loading?: boolean;
  disabled?: boolean;
  controls?: ReactNode;
}) {
  const showLoading = useDelayedLoading(loading);
  let body: ReactNode = <ul className="grid gap-3">{children}</ul>;
  if (loading) body = showLoading && <LoadingState label={`Loading ${title.toLowerCase()}`} />;
  else if (empty)
    body = emptyState ?? (
      <p className="text-sm text-muted-foreground">No {title.toLowerCase()} yet.</p>
    );
  return (
    <section aria-label={label} className="grid gap-4 rounded-xl border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{title}</h3>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              aria-label={addLabel}
              disabled={disabled || loading}
              onClick={onAdd}
            >
              <Plus aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{addLabel}</TooltipContent>
        </Tooltip>
      </div>
      {controls}
      {/* One minimum height for loading, empty, and short lists keeps the section from jumping. */}
      <div className="flex min-h-56 flex-col">{body}</div>
    </section>
  );
}
