import { DropdownMenuItem } from "../../ui/dropdown-menu";
import { PicturePreview } from "../../upload/picture-preview";
import { Check } from "lucide-react";

export function OrganizationSwitcherItem({
  organization,
  current,
  onSelect,
}: {
  organization: { id: string; name: string; logo?: string | null };
  current: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem
      disabled={current}
      aria-label={`${organization.name}${current ? " (current)" : ""}`}
      variant="workspace"
      onSelect={onSelect}
    >
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-surface text-xs font-semibold text-foreground shadow-surface"
      >
        <PicturePreview
          src={organization.logo}
          className="size-full rounded-lg object-contain"
          fallback={organization.name
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((word) => word[0])
            .join("")
            .toUpperCase()}
        />
      </span>
      <span className="min-w-0 flex-1 truncate">{organization.name}</span>
      {current && <Check className="size-4 shrink-0" />}
    </DropdownMenuItem>
  );
}
