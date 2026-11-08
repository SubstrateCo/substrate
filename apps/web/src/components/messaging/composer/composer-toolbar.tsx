import { Button } from "../../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import { Bold, Code, Italic } from "lucide-react";

const formats = [
  { label: "Bold text", tooltip: "Bold", icon: Bold, prefix: "**", suffix: "**" },
  { label: "Italic text", tooltip: "Italic", icon: Italic, prefix: "_", suffix: "_" },
  { label: "Code text", tooltip: "Code", icon: Code, prefix: "`", suffix: "`" },
];

export function ComposerToolbar({
  pending,
  onInsert,
}: {
  pending: boolean;
  onInsert: (prefix: string, suffix: string) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 pb-1.5">
      {formats.map(({ label, tooltip, icon: Icon, prefix, suffix }) => (
        <Tooltip key={label}>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label={label}
              disabled={pending}
              onClick={() => onInsert(prefix, suffix)}
            >
              <Icon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
