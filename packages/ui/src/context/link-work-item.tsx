import { PendingButton } from "../feedback/pending-button";

export function LinkWorkItem({
  title,
  pending,
  disabled,
  onLink,
}: {
  title: string;
  pending: boolean;
  disabled: boolean;
  onLink: () => void;
}) {
  return (
    <li>
      <PendingButton
        variant="ghost"
        pending={pending}
        pendingLabel={`Linking ${title}.`}
        disabled={disabled}
        onClick={onLink}
      >
        {title}
      </PendingButton>
    </li>
  );
}
