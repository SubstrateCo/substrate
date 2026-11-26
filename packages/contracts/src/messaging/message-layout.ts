export type MessageRow<T> = {
  message: T;
  /** The first message of a new day, with a divider above it. */
  newDay: boolean;
  /** Continues the previous message's group without an avatar or name. */
  grouped: boolean;
};
