export type RecordChangeDialog = "edit" | "archive";

/** Narrows a detail view's dialog state to the dialogs that RecordChangeDialogs renders. */
// oxlint-disable-next-line deslop/prefer-literal-union -- Detail views also supply domain-specific dialog names; this guard rejects those.
export function recordChangeDialog(dialog: string | null): RecordChangeDialog | null {
  return dialog === "edit" || dialog === "archive" ? dialog : null;
}
