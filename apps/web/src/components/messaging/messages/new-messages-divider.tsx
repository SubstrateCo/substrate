/** The line above the first message that was unread when the conversation opened. */
export function NewMessagesDivider() {
  return (
    <div
      role="separator"
      aria-label="New messages"
      data-unread-divider=""
      className="flex items-center gap-3 px-4 pt-3 pb-1"
    >
      <span aria-hidden="true" className="h-px flex-1 bg-primary" />
      <span aria-hidden="true" className="text-xs font-medium text-primary">
        New
      </span>
      <span aria-hidden="true" className="h-px flex-1 bg-primary" />
    </div>
  );
}
