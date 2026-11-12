import { eq, inArray, type Column, type SQL } from "drizzle-orm";

/** The compare-and-set condition of a machine event: the row is in one of its from states. */
export function inStates(column: Column, states: readonly string[]): SQL {
  return states.length === 1 ? eq(column, states[0]) : inArray(column, [...states]);
}
