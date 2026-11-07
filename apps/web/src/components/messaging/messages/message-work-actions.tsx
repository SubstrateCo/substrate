import { Button } from "../../ui/button";
import { Link2, ListPlus } from "lucide-react";

export function MessageWorkActions({
  onCreate,
  onLink,
}: {
  onCreate: () => void;
  onLink: () => void;
}) {
  return (
    <>
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        aria-label="Create task"
        title="Create task"
        onClick={onCreate}
      >
        <ListPlus aria-hidden="true" />
      </Button>
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
    </>
  );
}
