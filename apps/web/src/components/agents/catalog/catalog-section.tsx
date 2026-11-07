import type { ReactNode } from "react";

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
  disabled,
}: {
  title: string;
  label: string;
  description?: string;
  addLabel: string;
  onAdd: () => void;
  children: ReactNode;
  empty: boolean;
  disabled?: boolean;
}) {
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
              disabled={disabled}
              onClick={onAdd}
            >
              <Plus aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{addLabel}</TooltipContent>
        </Tooltip>
      </div>
      {empty ? (
        <p className="text-sm text-muted-foreground">No {title.toLowerCase()} yet.</p>
      ) : (
        <ul className="grid gap-3">{children}</ul>
      )}
    </section>
  );
}
