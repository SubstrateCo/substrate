import { SkeletonText } from "../../feedback/skeleton-text";
import { WorkspaceTile } from "../workspace-tile";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
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
      <WorkspaceTile name={organization?.name} logo={organization?.logo} />
      <span className="min-w-0 flex-1 truncate">
        {organization?.name ?? <SkeletonText width="8rem" />}
      </span>
      {current && <Check className="size-4 shrink-0" />}
    </>
  );
}
