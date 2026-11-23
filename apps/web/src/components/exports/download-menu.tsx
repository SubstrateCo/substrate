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
import { Download, FileJson, FileSpreadsheet } from "lucide-react";

/** A ghost icon tool for page headers that downloads the page's records as CSV or JSON. */
export function DownloadMenu({
  label,
  scope,
  urls,
}: {
  label: string;
  scope: string;
  urls: { csv: string; json: string };
}) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={label}>
              <Download aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
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
