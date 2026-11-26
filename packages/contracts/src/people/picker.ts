/** A workspace person offered by a people picker. */
export type PickerPerson = { id: string; name: string; email: string; image?: string | null };

/** An address without a person represents someone to invite. */
export type PickedRecipient = { email: string; person?: PickerPerson };
