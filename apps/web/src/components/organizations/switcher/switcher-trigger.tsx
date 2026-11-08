import { initials } from "./initials";
import { Button } from "@/components/ui/button";
import { DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PicturePreview } from "@/components/upload/picture-preview";

export function SwitcherTrigger({
  name,
  logo,
  pending,
}: {
  name: string;
  logo?: string | null;
  pending: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <DropdownMenuTrigger asChild>
          <Button
            variant="workspace"
            size="icon-lg"
            aria-label={`${name} ▾`}
            disabled={pending}
            aria-busy={pending}
          >
            <span
              aria-hidden="true"
              className="flex size-6 items-center justify-center overflow-hidden rounded-md text-xs font-semibold"
            >
              {pending ? (
                <Spinner aria-hidden="true" role="presentation" />
              ) : (
                <PicturePreview
                  src={logo}
                  className="size-full object-contain"
                  fallback={initials(name)}
                />
              )}
            </span>
          </Button>
        </DropdownMenuTrigger>
      </TooltipTrigger>
      <TooltipContent side="right">Switch workspace: {name}</TooltipContent>
    </Tooltip>
  );
}
