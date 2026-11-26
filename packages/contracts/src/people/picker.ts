/** A workspace person offered by a people picker. */
export type PickerPerson = { id: string; name: string; email: string; image?: string | null };

/** An owned, enabled agent offered alongside workspace people. */
export type PickerAgent = { id: string; name: string; image?: string | null };

/** An address without a person represents someone to invite. Agents use IDs, never email. */
export type PickedRecipient =
  | { email: string; person?: PickerPerson; agent?: never }
  | { agent: PickerAgent; email?: never; person?: never };
