import { Button } from "../primitives/button";
import { Spinner } from "../primitives/spinner";

export function OrganizationSelectionItem({
  name,
  pending,
  onSelect,
  buttonRef,
}: {
  name: string;
  pending: boolean;
  onSelect: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <Button
      ref={buttonRef}
      variant="outline"
      size="selection"
      className="max-w-full min-w-0 justify-start text-left whitespace-normal"
      disabled={pending}
      aria-busy={pending}
      onClick={onSelect}
    >
      <span
        aria-hidden="true"
        className="mr-2 flex size-8 shrink-0 items-center justify-center rounded-md bg-accent text-xs font-semibold text-accent-foreground"
      >
        {pending ? (
          <Spinner aria-hidden="true" role="presentation" />
        ) : (
          name.slice(0, 2).toUpperCase()
        )}
      </span>
      <span className="min-w-0 wrap-anywhere">{name}</span>
    </Button>
  );
}
import type { Ref } from "react";
