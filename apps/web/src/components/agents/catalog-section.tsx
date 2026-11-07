import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

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
  description: string;
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
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Button variant="outline" disabled={disabled} onClick={onAdd}>
          {addLabel}
        </Button>
      </div>
      {empty ? (
        <p className="text-sm text-muted-foreground">No {title.toLowerCase()} yet.</p>
      ) : (
        <ul className="grid gap-3">{children}</ul>
      )}
    </section>
  );
}
