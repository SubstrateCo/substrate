import { SkeletonText } from "../../feedback/skeleton-text";
import { DropdownMenuItem } from "../../ui/dropdown-menu";
import { Skeleton } from "../../ui/skeleton";
import { PicturePreview } from "../../upload/picture-preview";
import { initials } from "@/lib/people/initials";
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
      <SwitcherItemContent organization={organization} current={current} />
    </DropdownMenuItem>
  );
}

export function OrganizationSwitcherItemSkeleton() {
  return (
    <div className="flex items-center gap-3 px-2 py-2 text-sm">
      <SwitcherItemContent />
    </div>
  );
}

function SwitcherItemContent({
  organization,
  current,
}: {
  organization?: { name: string; logo?: string | null };
  current?: boolean;
}) {
  return (
    <>
      {organization ? (
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-surface text-xs font-semibold text-foreground shadow-surface"
        >
          <PicturePreview
            src={organization.logo}
            className="size-full rounded-lg object-contain"
            fallback={initials(organization.name)}
          />
        </span>
      ) : (
        <span className="size-8 shrink-0 overflow-hidden rounded-lg">
          <Skeleton className="size-full" />
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">
        {organization?.name ?? <SkeletonText width="8rem" />}
      </span>
      {current && <Check className="size-4 shrink-0" />}
    </>
  );
}
