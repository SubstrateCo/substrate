import { Button } from "../../ui/button";
import { Kbd, KbdGroup } from "../../ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import { Bold, Code, Italic } from "lucide-react";

export const composerFormats = [
  { label: "Bold text", tooltip: "Bold", key: "b", icon: Bold, prefix: "**", suffix: "**" },
  { label: "Italic text", tooltip: "Italic", key: "i", icon: Italic, prefix: "_", suffix: "_" },
  { label: "Code text", tooltip: "Code", key: "e", icon: Code, prefix: "`", suffix: "`" },
];

export function ComposerToolbar({
  pending,
  onInsert,
}: {
  pending: boolean;
  onInsert: (prefix: string, suffix: string) => void;
}) {
  return (
    <>
      {composerFormats.map(({ label, tooltip, key, icon: Icon, prefix, suffix }) => (
        <Tooltip key={label}>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={label}
              aria-keyshortcuts={`Control+${key.toUpperCase()}`}
              disabled={pending}
              onClick={() => onInsert(prefix, suffix)}
            >
              <Icon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {tooltip}
            <KbdGroup>
              <Kbd>Ctrl</Kbd>
              <Kbd>{key.toUpperCase()}</Kbd>
            </KbdGroup>
          </TooltipContent>
        </Tooltip>
      ))}
    </>
  );
}
