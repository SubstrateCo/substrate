import { Button } from "@/ui/primitives/button";
import { DropdownMenuTrigger } from "@/ui/primitives/dropdown-menu";
import { Spinner } from "@/ui/primitives/spinner";
import { PicturePreview } from "@/ui/upload/picture-preview";
import { ChevronsUpDown } from "lucide-react";

export function SwitcherTrigger({
  name,
  logo,
  compact,
  pending,
}: {
  name: string;
  logo?: string | null;
  compact: boolean;
  pending: boolean;
}) {
  return (
    <DropdownMenuTrigger asChild>
      <Button
        variant={compact ? "workspace" : "outline"}
        size={compact ? "icon-lg" : "default"}
        aria-label={`${name} ▾`}
        title={compact ? `Switch workspace: ${name}` : undefined}
        disabled={pending}
        aria-busy={pending}
      >
        {compact ? (
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
                fallback={name
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((word) => word[0])
                  .join("")
                  .toUpperCase()}
              />
            )}
          </span>
        ) : (
          <>
            {logo && (
              <span aria-hidden="true" className="size-5 overflow-hidden rounded-md">
                <PicturePreview src={logo} className="size-full object-contain" fallback={null} />
              </span>
            )}
            <span className="max-w-48 truncate">{pending ? "Switching…" : name}</span>
            {pending ? (
              <Spinner aria-hidden="true" role="presentation" />
            ) : (
              <ChevronsUpDown className="size-4 text-muted-foreground" />
            )}
          </>
        )}
      </Button>
    </DropdownMenuTrigger>
  );
}
