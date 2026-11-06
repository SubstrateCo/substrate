import { Button } from "../primitives/button";

export function MessageWorkActions({
  onCreate,
  onLink,
}: {
  onCreate: () => void;
  onLink: () => void;
}) {
  return (
    <>
      <Button size="xs" variant="ghost" onClick={onCreate}>
        Create task
      </Button>
      <Button size="xs" variant="ghost" onClick={onLink}>
        Link existing work
      </Button>
    </>
  );
}
