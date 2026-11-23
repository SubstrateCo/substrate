import type { CalendarEventSummary } from "@substrate/contracts/calendar";

import { addDays, eventOnDay, eventSpan, startOfDay } from "./days";

export const dayMinutes = 24 * 60;
/** The shortest block on the grid, so a 5-minute event still has room for its title. */
export const minimumBlockMinutes = 20;

export interface PlacedEvent {
  event: CalendarEventSummary;
  /** Minutes from the start of the day. */
  top: number;
  /** Minutes of the day the block covers. */
  height: number;
  /** The block's column among the events it overlaps, from 0. */
  column: number;
  /** How many columns its group of overlapping events uses. */
  columns: number;
}

// Clock minutes, not elapsed time, so blocks line up with the hour marks on daylight saving days.
const clockMinutes = (date: Date) => date.getHours() * 60 + date.getMinutes();

/**
 * Places one day's timed events on a time grid. Events that overlap share the width: each takes
 * the first free column, and every event in a chain of overlaps uses the chain's column count.
 */
export function layoutDay(events: readonly CalendarEventSummary[], day: Date): PlacedEvent[] {
  const dayStart = startOfDay(day);
  const dayEnd = addDays(dayStart, 1);
  const blocks = events
    .flatMap((event) => {
      if (event.allDay || !eventOnDay(event, day)) return [];
      const { start, end } = eventSpan(event);
      const from = start <= dayStart ? 0 : clockMinutes(start);
      const until = end >= dayEnd ? dayMinutes : clockMinutes(end);
      const top = Math.min(from, dayMinutes - minimumBlockMinutes);
      const bottom = Math.min(Math.max(until, top + minimumBlockMinutes), dayMinutes);
      return [{ event, top, bottom }];
    })
    .sort(
      (a, b) =>
        a.top - b.top || b.bottom - a.bottom || a.event.entityId.localeCompare(b.event.entityId),
    );
  const placed: PlacedEvent[] = [];
  let group: PlacedEvent[] = [];
  let columnEnds: number[] = [];
  let groupEnd = -1;
  const closeGroup = () => {
    for (const item of group) item.columns = columnEnds.length;
    group = [];
    columnEnds = [];
  };
  for (const block of blocks) {
    if (block.top >= groupEnd) closeGroup();
    let column = columnEnds.findIndex((end) => end <= block.top);
    if (column === -1) column = columnEnds.push(block.bottom) - 1;
    else columnEnds[column] = block.bottom;
    const item = {
      event: block.event,
      top: block.top,
      height: block.bottom - block.top,
      column,
      columns: 1,
    };
    group.push(item);
    placed.push(item);
    groupEnd = Math.max(groupEnd, block.bottom);
  }
  closeGroup();
  return placed;
}

/** Where the grid opens when the week has no timed events: 7 AM. */
export const defaultScrollMinutes = 7 * 60;

/**
 * Where the grid opens: the whole hour before the week's first timed event, so that event and its
 * hour label are in view, or 7 AM for an empty week.
 */
export function initialScrollMinutes(placed: readonly Pick<PlacedEvent, "top">[]) {
  if (!placed.length) return defaultScrollMinutes;
  const first = Math.min(...placed.map((item) => item.top));
  return Math.max(0, Math.floor(first / 60) * 60 - 60);
}

/** Where the current-time line sits, in minutes from the start of the day. */
export const nowMinutes = (now: Date) => clockMinutes(now) + now.getSeconds() / 60;
