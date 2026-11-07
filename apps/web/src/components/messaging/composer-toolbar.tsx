import { Button } from "../ui/button";
import { Bold, Code, Italic } from "lucide-react";

export function ComposerToolbar({
  pending,
  onInsert,
}: {
  pending: boolean;
  onInsert: (prefix: string, suffix: string) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 border-b border-border/60 bg-muted/30 px-2 py-0.5">
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        aria-label="Bold text"
        disabled={pending}
        onClick={() => onInsert("**", "**")}
      >
        <Bold />
      </Button>
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        aria-label="Italic text"
        disabled={pending}
        onClick={() => onInsert("_", "_")}
      >
        <Italic />
      </Button>
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        aria-label="Code text"
        disabled={pending}
        onClick={() => onInsert("`", "`")}
      >
        <Code />
      </Button>
    </div>
  );
}
