import { Bold, Code, Italic } from "lucide-react";
import { Button } from "../primitives/button";

export function ComposerToolbar({
  pending,
  onReferences,
  onInsert,
}: {
  pending: boolean;
  onReferences?: () => void;
  onInsert: (prefix: string, suffix: string) => void;
}) {
  return (
    <div className="flex items-center gap-1 border-b border-border/60 bg-muted/30 px-2 py-1">
      {onReferences && (
        <Button type="button" size="xs" variant="ghost" disabled={pending} onClick={onReferences}>
          Insert reference
        </Button>
      )}
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label="Bold text"
        disabled={pending}
        onClick={() => onInsert("**", "**")}
      >
        <Bold />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label="Italic text"
        disabled={pending}
        onClick={() => onInsert("_", "_")}
      >
        <Italic />
      </Button>
      <Button
        type="button"
        size="icon-sm"
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
