import { Button } from "../../ui/button";
import { Kbd, KbdGroup } from "../../ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import { composerFormats } from "./composer-formats";

export function ComposerToolbar({
  pending,
  onInsert,
}: {
  pending: boolean;
  onInsert: (prefix: string, suffix: string) => void;
}) {
  return (
    <>
      {composerFormats.map(({ label, key, icon: Icon, prefix, suffix }) => (
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
            {label}
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
