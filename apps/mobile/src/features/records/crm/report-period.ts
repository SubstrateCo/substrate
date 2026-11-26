import { validDate } from "../format";

/** CRM closes are UTC date cohorts; the last selected date is included. */
export function reportPeriod(fromDate: string, throughDate: string) {
  if (!validDate(fromDate) || !validDate(throughDate) || fromDate > throughDate) return null;
  const from = new Date(`${fromDate}T00:00:00.000Z`);
  const to = new Date(`${throughDate}T00:00:00.000Z`);
  to.setUTCDate(to.getUTCDate() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}
