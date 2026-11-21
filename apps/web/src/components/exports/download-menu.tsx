import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronDown, Download, FileJson, FileSpreadsheet } from "lucide-react";

export function DownloadMenu({
  label,
  scope,
  urls,
  iconOnly = false,
}: {
  label: string;
  scope: string;
  urls: { csv: string; json: string };
  iconOnly?: boolean;
}) {
  const trigger = (
    <DropdownMenuTrigger asChild>
      <Button
        variant={iconOnly ? "ghost" : "outline"}
        size={iconOnly ? "icon-sm" : "sm"}
        aria-label={label}
      >
        <Download aria-hidden="true" />
        {!iconOnly && (
          <>
            Download
            <ChevronDown aria-hidden="true" />
          </>
        )}
      </Button>
    </DropdownMenuTrigger>
  );
  return (
    <DropdownMenu>
      {iconOnly ? (
        <Tooltip>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      ) : (
        trigger
      )}
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{scope}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href={urls.csv} download>
            <FileSpreadsheet aria-hidden="true" />
            Download CSV
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={urls.json} download>
            <FileJson aria-hidden="true" />
            Download JSON
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
