import { Button } from "../../ui/button";
import { Link2 } from "lucide-react";

export function MessageWorkActions({ onLink }: { onLink: () => void }) {
  return (
    <Button
      type="button"
      size="icon-xs"
      variant="ghost"
      aria-label="Link existing work"
      title="Link existing work"
      onClick={onLink}
    >
      <Link2 aria-hidden="true" />
    </Button>
  );
}
