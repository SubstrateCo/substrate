import { eq, inArray, type Column, type SQL } from "drizzle-orm";

export function inStates(column: Column, states: readonly string[]): SQL {
  return states.length === 1 ? eq(column, states[0]) : inArray(column, [...states]);
}
