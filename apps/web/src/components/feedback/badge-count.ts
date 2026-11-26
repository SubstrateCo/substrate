/** Caps a count so the badge stays narrow. */
export const badgeCount = (count: number) => (count > 99 ? "99+" : String(count));
